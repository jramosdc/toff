import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db, { prisma, isPrismaEnabled } from '@/lib/db';
import { sendTimeOffRequestApprovedEmail, sendTimeOffRequestRejectedEmail } from '@/lib/email';

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