import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db, { prisma, isPrismaEnabled } from '@/lib/db';
import { sendTimeOffRequestApprovedEmail, sendTimeOffRequestRejectedEmail } from '@/lib/email';
import { calculateWorkingDays } from '@/lib/date-utils';

// Get a specific time off request
export async function GET(
  request: Request,
  { params }: { params: { requestId: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const requestId = params.requestId;
    console.log("Fetching time off request:", requestId);
    console.log("DATABASE_URL:", process.env.DATABASE_URL);
    console.log("isPrismaEnabled:", isPrismaEnabled);
    console.log("Prisma client available:", !!prisma);
    console.log("VERCEL:", process.env.VERCEL);
    
    // Use Prisma in production
    if (process.env.VERCEL || (isPrismaEnabled && prisma)) {
      console.log("Using Prisma to fetch time off request");
      
      const timeOffRequest = await prisma?.timeOffRequest.findUnique({
        where: {
          id: requestId,
        },
      });
      
      if (!timeOffRequest || (timeOffRequest.userId !== session.user.id && session.user.role !== 'ADMIN')) {
        return NextResponse.json({ error: 'Time off request not found' }, { status: 404 });
      }
      
      // Transform to match expected format
      const formattedRequest = {
        id: timeOffRequest.id,
        user_id: timeOffRequest.userId,
        start_date: timeOffRequest.startDate.toISOString(),
        end_date: timeOffRequest.endDate.toISOString(),
        type: timeOffRequest.type,
        status: timeOffRequest.status,
        reason: timeOffRequest.reason
      };
      
      return NextResponse.json(formattedRequest);
      
    } else if (db) {
      console.log("Using SQLite to fetch time off request");
      const query = `
        SELECT * FROM time_off_requests 
        WHERE id = ? AND user_id = ?
      `;
      const timeOffRequest = db.prepare(query).get(requestId, session.user.id);

      if (!timeOffRequest) {
        return NextResponse.json({ error: 'Time off request not found' }, { status: 404 });
      }

      return NextResponse.json(timeOffRequest);
    } else {
      throw new Error("No database connection available");
    }
  } catch (error) {
    console.error('Error fetching time off request:', error);
    return NextResponse.json(
      { error: `Failed to fetch time off request: ${error}` },
      { status: 500 }
    );
  }
}

// Update the status of a time off request
export async function PATCH(
  request: Request,
  { params }: { params: { requestId: string } }
) {
  const session = await getServerSession(authOptions);
  const requestId = params.requestId;

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { status } = body;

    if (!status || !['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status provided' },
        { status: 400 }
      );
    }
    
    console.log("Updating time off request:", requestId, "to status:", status);
    console.log("DATABASE_URL:", process.env.DATABASE_URL);
    console.log("isPrismaEnabled:", isPrismaEnabled);
    console.log("Prisma client available:", !!prisma);
    console.log("VERCEL:", process.env.VERCEL);
    console.log("Session user:", session.user);
    
    // Use Prisma in production
    if (process.env.VERCEL || (isPrismaEnabled && prisma)) {
      console.log("Using Prisma to update time off request");
      
      // Check if the request exists
      const existingRequest = await prisma?.timeOffRequest.findUnique({
        where: { id: requestId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            }
          }
        }
      });
      
      if (!existingRequest) {
        return NextResponse.json(
          { error: 'Time off request not found' },
          { status: 404 }
        );
      }
      
      // Check if the user is the owner of the request or an admin
      if (existingRequest.userId !== session.user.id && session.user.role !== 'ADMIN') {
        return NextResponse.json(
          { error: 'Unauthorized to update this request' },
          { status: 403 }
        );
      }

      // Process approval - only update balance if we're changing from PENDING to APPROVED
      if (status === 'APPROVED' && existingRequest.status !== 'APPROVED') {
        console.log("Approving time off request - updating balance");
        const currentYear = new Date().getFullYear();
        
        // Get the user's current time off balance
        const userBalance = await prisma?.timeOffBalance.findFirst({
          where: {
            userId: existingRequest.userId,
            year: currentYear
          }
        });
        
        if (!userBalance) {
          return NextResponse.json(
            { error: 'User time off balance not found' },
            { status: 404 }
          );
        }
        
        // Calculate the number of days for this time off request
        const startDate = new Date(existingRequest.startDate);
        const endDate = new Date(existingRequest.endDate);
        const daysRequested = calculateWorkingDays(startDate, endDate);
        
        console.log("Request from", startDate, "to", endDate, "equals", daysRequested, "working days");
        
        // Determine which balance to update based on request type
        let updatedBalance;
        
        if (existingRequest.type === 'VACATION') {
          // Check if user has enough vacation days
          if (userBalance.vacationDays < daysRequested) {
            return NextResponse.json(
              { error: 'Not enough vacation days available' },
              { status: 400 }
            );
          }
          
          // Deduct from vacation balance
          updatedBalance = await prisma?.timeOffBalance.update({
            where: { id: userBalance.id },
            data: { 
              vacationDays: userBalance.vacationDays - daysRequested 
            }
          });
          console.log(`Deducted ${daysRequested} vacation days from balance`);
          
        } else if (existingRequest.type === 'SICK') {
          // Check if user has enough sick days
          if (userBalance.sickDays < daysRequested) {
            return NextResponse.json(
              { error: 'Not enough sick days available' },
              { status: 400 }
            );
          }
          
          // Deduct from sick days balance
          updatedBalance = await prisma?.timeOffBalance.update({
            where: { id: userBalance.id },
            data: { 
              sickDays: userBalance.sickDays - daysRequested 
            }
          });
          console.log(`Deducted ${daysRequested} sick days from balance`);
          
        } else if (existingRequest.type === 'PAID_LEAVE') {
          // Check if user has enough paid leave
          if (userBalance.paidLeave < daysRequested) {
            return NextResponse.json(
              { error: 'Not enough paid leave days available' },
              { status: 400 }
            );
          }
          
          // Deduct from paid leave balance
          updatedBalance = await prisma?.timeOffBalance.update({
            where: { id: userBalance.id },
            data: { 
              paidLeave: userBalance.paidLeave - daysRequested 
            }
          });
          console.log(`Deducted ${daysRequested} paid leave days from balance`);
        } else if (existingRequest.type === 'PERSONAL') {
          // Check if user has enough personal days
          if (userBalance.personalDays < daysRequested) {
            return NextResponse.json(
              { error: 'Not enough personal days available' },
              { status: 400 }
            );
          }
          
          // Deduct from personal days balance
          updatedBalance = await prisma?.timeOffBalance.update({
            where: { id: userBalance.id },
            data: { 
              personalDays: userBalance.personalDays - daysRequested 
            }
          });
          console.log(`Deducted ${daysRequested} personal days from balance`);
        }
        
        console.log("Updated balance:", updatedBalance);
      }
      
      // Update the request status
      const updatedRequest = await prisma?.timeOffRequest.update({
        where: { id: requestId },
        data: { status },
      });
      
      console.log("Request updated successfully:", updatedRequest);
      
      // Send email notification if the status is updated by an admin
      if (session.user.role === 'ADMIN' && existingRequest.status !== status && existingRequest.user) {
        const user = existingRequest.user;
        
        if (status === 'APPROVED') {
          await sendTimeOffRequestApprovedEmail(
            user.email,
            user.name,
            existingRequest.startDate.toISOString(),
            existingRequest.endDate.toISOString(),
            existingRequest.type
          );
          console.log("Approval email sent to:", user.email);
        } else if (status === 'REJECTED') {
          await sendTimeOffRequestRejectedEmail(
            user.email,
            user.name,
            existingRequest.startDate.toISOString(),
            existingRequest.endDate.toISOString(),
            existingRequest.type,
            body.reason || undefined
          );
          console.log("Rejection email sent to:", user.email);
        }
      }
      
      // Transform to match expected format
      const formattedRequest = {
        id: updatedRequest?.id,
        user_id: updatedRequest?.userId,
        start_date: updatedRequest?.startDate.toISOString(),
        end_date: updatedRequest?.endDate.toISOString(),
        type: updatedRequest?.type,
        status: updatedRequest?.status,
        reason: updatedRequest?.reason
      };
      
      return NextResponse.json(formattedRequest);
      
    } else if (db) {
      console.log("Using SQLite to update time off request");
      // Check if the request exists
      const checkQuery = `SELECT * FROM time_off_requests WHERE id = ?`;
      const existingRequest = db.prepare(checkQuery).get(requestId) as {
        id: string;
        user_id: string;
        status: string;
        start_date: string;
        end_date: string;
        type: string;
        reason?: string;
      } | undefined;

      if (!existingRequest) {
        return NextResponse.json(
          { error: 'Time off request not found' },
          { status: 404 }
        );
      }

      // Check if the user is the owner of the request or an admin
      if (existingRequest.user_id !== session.user.id && session.user.role !== 'ADMIN') {
        return NextResponse.json(
          { error: 'Unauthorized to update this request' },
          { status: 403 }
        );
      }

      // Process approval - update balance if changing to approved
      if (status === 'APPROVED' && existingRequest.status !== 'APPROVED') {
        console.log("Approving time off request - updating balance");
        const currentYear = new Date().getFullYear();
        
        // Get the user's current time off balance
        const userBalance = db.prepare(
          'SELECT * FROM time_off_balances WHERE user_id = ? AND year = ?'
        ).get(existingRequest.user_id, currentYear) as {
          id: string;
          user_id: string;
          vacation_days: number;
          sick_days: number;
          paid_leave: number;
          year: number;
        } | undefined;
        
        if (!userBalance) {
          return NextResponse.json(
            { error: 'User time off balance not found' },
            { status: 404 }
          );
        }
        
        // Calculate the number of days for this time off request
        const startDate = new Date(existingRequest.start_date);
        const endDate = new Date(existingRequest.end_date);
        const daysRequested = calculateWorkingDays(startDate, endDate);
        
        console.log("Request from", startDate, "to", endDate, "equals", daysRequested, "working days");
        
        // Update the appropriate balance based on request type
        if (existingRequest.type === 'VACATION') {
          // Check if user has enough vacation days
          if (userBalance.vacation_days < daysRequested) {
            return NextResponse.json(
              { error: 'Not enough vacation days available' },
              { status: 400 }
            );
          }
          
          // Deduct from vacation balance
          db.prepare(
            'UPDATE time_off_balances SET vacation_days = vacation_days - ? WHERE id = ?'
          ).run(daysRequested, userBalance.id);
          console.log(`Deducted ${daysRequested} vacation days from balance`);
          
        } else if (existingRequest.type === 'SICK') {
          // Check if user has enough sick days
          if (userBalance.sick_days < daysRequested) {
            return NextResponse.json(
              { error: 'Not enough sick days available' },
              { status: 400 }
            );
          }
          
          // Deduct from sick days balance
          db.prepare(
            'UPDATE time_off_balances SET sick_days = sick_days - ? WHERE id = ?'
          ).run(daysRequested, userBalance.id);
          console.log(`Deducted ${daysRequested} sick days from balance`);
          
        } else if (existingRequest.type === 'PAID_LEAVE') {
          // Check if user has enough paid leave
          if (userBalance.paid_leave < daysRequested) {
            return NextResponse.json(
              { error: 'Not enough paid leave days available' },
              { status: 400 }
            );
          }
          
          // Deduct from paid leave balance
          db.prepare(
            'UPDATE time_off_balances SET paid_leave = paid_leave - ? WHERE id = ?'
          ).run(daysRequested, userBalance.id);
          console.log(`Deducted ${daysRequested} paid leave days from balance`);
        } else if (existingRequest.type === 'PERSONAL') {
          // Check if user has enough personal days
          if (userBalance.personal_days < daysRequested) {
            return NextResponse.json(
              { error: 'Not enough personal days available' },
              { status: 400 }
            );
          }
          
          // Deduct from personal days balance
          db.prepare(
            'UPDATE time_off_balances SET personal_days = personal_days - ? WHERE id = ?'
          ).run(daysRequested, userBalance.id);
          console.log(`Deducted ${daysRequested} personal days from balance`);
        }
      }

      // Update the request status
      const updateQuery = `
        UPDATE time_off_requests 
        SET status = ? 
        WHERE id = ?
      `;
      db.prepare(updateQuery).run(status, requestId);

      // Get the updated request
      const updatedRequest = db.prepare(checkQuery).get(requestId);

      // Send email notification if the status is updated by an admin
      if (session.user.role === 'ADMIN' && existingRequest.status !== status) {
        // Get user details
        const userQuery = `SELECT * FROM users WHERE id = ?`;
        const user = db.prepare(userQuery).get(existingRequest.user_id) as {
          id: string;
          email: string;
          name: string;
        } | undefined;

        if (user) {
          if (status === 'APPROVED') {
            await sendTimeOffRequestApprovedEmail(
              user.email,
              user.name,
              existingRequest.start_date,
              existingRequest.end_date,
              existingRequest.type
            );
          } else if (status === 'REJECTED') {
            await sendTimeOffRequestRejectedEmail(
              user.email,
              user.name,
              existingRequest.start_date,
              existingRequest.end_date,
              existingRequest.type,
              body.reason || undefined
            );
          }
        }
      }

      return NextResponse.json(updatedRequest);
    } else {
      throw new Error("No database connection available");
    }
  } catch (error) {
    console.error('Error updating time off request:', error);
    return NextResponse.json(
      { error: `Failed to update time off request: ${error}` },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { requestId: string } }
) {
  const session = await getServerSession(authOptions);
  const requestId = params.requestId;

  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Use Prisma in production
    if (process.env.VERCEL || (isPrismaEnabled && prisma)) {
      // Get the request details first
      const timeOffRequest = await prisma?.timeOffRequest.findUnique({
        where: { id: requestId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            }
          }
        }
      });

      if (!timeOffRequest) {
        return NextResponse.json({ error: 'Time off request not found' }, { status: 404 });
      }

      // If the request was approved, we need to restore the balance
      if (timeOffRequest.status === 'APPROVED') {
        const currentYear = new Date().getFullYear();
        const userBalance = await prisma?.timeOffBalance.findFirst({
          where: {
            userId: timeOffRequest.userId,
            year: currentYear
          }
        });

        if (userBalance) {
          // Calculate the number of days to restore
          const startDate = new Date(timeOffRequest.startDate);
          const endDate = new Date(timeOffRequest.endDate);
          const daysToRestore = calculateWorkingDays(startDate, endDate);

          // Restore the appropriate balance based on request type
          if (timeOffRequest.type === 'VACATION') {
            await prisma?.timeOffBalance.update({
              where: { id: userBalance.id },
              data: { vacationDays: userBalance.vacationDays + daysToRestore }
            });
          } else if (timeOffRequest.type === 'SICK') {
            await prisma?.timeOffBalance.update({
              where: { id: userBalance.id },
              data: { sickDays: userBalance.sickDays + daysToRestore }
            });
          } else if (timeOffRequest.type === 'PAID_LEAVE') {
            await prisma?.timeOffBalance.update({
              where: { id: userBalance.id },
              data: { paidLeave: userBalance.paidLeave + daysToRestore }
            });
          } else if (timeOffRequest.type === 'PERSONAL') {
            await prisma?.timeOffBalance.update({
              where: { id: userBalance.id },
              data: { personalDays: userBalance.personalDays + daysToRestore }
            });
          }
        }
      }

      // Delete the request
      await prisma?.timeOffRequest.delete({
        where: { id: requestId }
      });

    } else if (db) {
      // Get the request details first
      const timeOffRequest = db.prepare(`
        SELECT * FROM time_off_requests 
        WHERE id = ?
      `).get(requestId);

      if (!timeOffRequest) {
        return NextResponse.json({ error: 'Time off request not found' }, { status: 404 });
      }

      // If the request was approved, we need to restore the balance
      if (timeOffRequest.status === 'APPROVED') {
        const currentYear = new Date().getFullYear();
        const userBalance = db.prepare(`
          SELECT * FROM time_off_balances 
          WHERE user_id = ? AND year = ?
        `).get(timeOffRequest.user_id, currentYear);

        if (userBalance) {
          // Calculate the number of days to restore
          const startDate = new Date(timeOffRequest.start_date);
          const endDate = new Date(timeOffRequest.end_date);
          const daysToRestore = calculateWorkingDays(startDate, endDate);

          // Restore the appropriate balance based on request type
          if (timeOffRequest.type === 'VACATION') {
            db.prepare(`
              UPDATE time_off_balances 
              SET vacation_days = vacation_days + ? 
              WHERE id = ?
            `).run(daysToRestore, userBalance.id);
          } else if (timeOffRequest.type === 'SICK') {
            db.prepare(`
              UPDATE time_off_balances 
              SET sick_days = sick_days + ? 
              WHERE id = ?
            `).run(daysToRestore, userBalance.id);
          } else if (timeOffRequest.type === 'PAID_LEAVE') {
            db.prepare(`
              UPDATE time_off_balances 
              SET paid_leave = paid_leave + ? 
              WHERE id = ?
            `).run(daysToRestore, userBalance.id);
          } else if (timeOffRequest.type === 'PERSONAL') {
            db.prepare(`
              UPDATE time_off_balances 
              SET personal_days = personal_days + ? 
              WHERE id = ?
            `).run(daysToRestore, userBalance.id);
          }
        }
      }

      // Delete the request
      db.prepare(`
        DELETE FROM time_off_requests 
        WHERE id = ?
      `).run(requestId);
    } else {
      throw new Error("No database connection available");
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting time off request:', error);
    return NextResponse.json(
      { error: `Failed to delete time off request: ${error}` },
      { status: 500 }
    );
  }
} 