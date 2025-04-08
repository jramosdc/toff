import { getServerSession } from 'next-auth/next';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { authOptions } from '@/lib/auth';
import { 
  sendTimeOffRequestSubmittedEmail, 
  sendTimeOffRequestAdminNotification 
} from '@/lib/email';
import db, { prisma, isPrismaEnabled, dbOperations } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import Debug from 'debug';
import { calculateWorkingDays } from '@/lib/date-utils';

interface TimeOffBalance {
  vacationDays: number;
  sickDays: number;
  paidLeave: number;
}

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
    });
  }

  console.log('Session user in requests GET:', session.user);

  const userId = session.user.id;
  const userRole = session.user.role;
  
  if (!userId) {
    return new NextResponse(JSON.stringify({ error: 'User ID not found in session' }), {
      status: 400,
    });
  }
  
  try {
    let requests;
    
    // Use Prisma in production/Vercel environment
    if (process.env.VERCEL || isPrismaEnabled) {
      console.log("Using Prisma to fetch time off requests");
      if (userRole === 'ADMIN') {
        requests = await prisma?.timeOffRequest.findMany({
          where: { status: 'PENDING' },
          include: { user: { select: { name: true, email: true } } }
        });
        
        // Transform to match the expected format
        requests = requests?.map(req => ({
          id: req.id,
          user_id: req.userId,
          start_date: req.startDate.toISOString(),
          end_date: req.endDate.toISOString(),
          type: req.type,
          status: req.status,
          reason: req.reason,
          user_name: req.user.name,
          user_email: req.user.email
        }));
      } else {
        const userRequests = await prisma?.timeOffRequest.findMany({
          where: { userId }
        });
        
        // Transform to match the expected format
        requests = userRequests?.map(req => ({
          id: req.id,
          user_id: req.userId,
          start_date: req.startDate.toISOString(),
          end_date: req.endDate.toISOString(),
          type: req.type,
          status: req.status,
          reason: req.reason
        }));
      }
    } else if (db) {
      console.log("Using SQLite to fetch time off requests");
      // SQLite fallback for development
      try {
        // Attempt to use dbOperations if it exists
        if (typeof dbOperations !== 'undefined') {
          requests = userRole === 'ADMIN'
            ? dbOperations.getTimeOffRequests?.all('PENDING')
            : dbOperations.getUserTimeOffRequests?.all(userId);
        } else {
          // Fallback to direct SQLite queries
          if (userRole === 'ADMIN') {
            const stmt = db.prepare(`
              SELECT t.*, u.name as user_name, u.email as user_email
              FROM time_off_requests t
              JOIN users u ON t.user_id = u.id
              WHERE t.status = ?
            `);
            requests = stmt.all('PENDING');
          } else {
            const stmt = db.prepare(`
              SELECT * FROM time_off_requests
              WHERE user_id = ?
            `);
            requests = stmt.all(userId);
          }
        }
      } catch (dbError) {
        console.error("Error executing SQLite query:", dbError);
        requests = [];
      }
    } else {
      throw new Error("No database connection available");
    }
    
    console.log('Time off requests from DB:', JSON.stringify(requests || [], null, 2));
    return new NextResponse(JSON.stringify(requests || []));
  } catch (error) {
    console.error("Error fetching time off requests:", error);
    return new NextResponse(JSON.stringify({ error: `Error fetching requests: ${error}` }), {
      status: 500,
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const debug = Debug('toff:api:time-off:requests:post');
    debug('POST request received');
    
    // Get session and verify authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      debug('No session found or user not authenticated');
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    
    // Get user info for notifications
    const userId = session.user.id;
    const userName = session.user.name || 'User';
    const userEmail = session.user.email || '';
    debug('Session user:', { userId, userName, userEmail });
    
    // Parse request body
    const body = await req.json();
    debug('Request body:', body);
    
    const {
      userId: requestUserId,
      startDate,
      endDate,
      type,
      reason
    } = body;
    
    // Use provided userId or fall back to session user id
    const effectiveUserId = requestUserId || userId;
    debug('Effective userId:', effectiveUserId);
    
    // Validate required fields
    if (!startDate || !endDate || !type) {
      debug('Missing required fields');
      return NextResponse.json(
        { error: "startDate, endDate, and type are required" },
        { status: 400 }
      );
    }
    
    let id: string;
    
    if (process.env.VERCEL || isPrismaEnabled) {
      debug('Using Prisma to create time off request');
      
      // Create request in Postgres with Prisma
      const startDateObj = new Date(startDate);
      const endDateObj = new Date(endDate);
      
      // Set time components to ensure consistent date handling
      startDateObj.setHours(0, 0, 0, 0);
      endDateObj.setHours(23, 59, 59, 999);
      
      // Calculate working days
      const workingDays = calculateWorkingDays(startDateObj, endDateObj);
      
      const request = await prisma?.timeOffRequest.create({
        data: {
          userId: effectiveUserId,
          startDate: startDateObj,
          endDate: endDateObj,
          type,
          status: 'PENDING',
          reason: reason || null,
          workingDays
        },
        include: {
          user: true
        }
      });
      
      id = request?.id as string;
      debug('Time off request created with ID:', id);
      
    } else if (db) {
      debug('Using SQLite to create time off request');
      // Create request in SQLite
      id = uuidv4();
      const startDateObj = new Date(startDate);
      const endDateObj = new Date(endDate);
      
      // Set time components to ensure consistent date handling
      startDateObj.setHours(0, 0, 0, 0);
      endDateObj.setHours(23, 59, 59, 999);
      
      // Calculate working days
      const workingDays = calculateWorkingDays(startDateObj, endDateObj);
      
      const statement = db.prepare(`
        INSERT INTO time_off_requests (
          id, user_id, start_date, end_date, type, status, reason, working_days
        ) VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)
      `);
      
      statement.run(
        id, 
        effectiveUserId, 
        startDateObj.toISOString(), 
        endDateObj.toISOString(), 
        type, 
        reason || null, 
        workingDays
      );
      debug('SQLite request created with ID:', id);
    } else {
      throw new Error("No database connection available");
    }
    
    // Try to send email notification to admin(s) only, not to the employee
    try {
      // Remove the email to employee
      // if (typeof sendTimeOffRequestSubmittedEmail === 'function' && userEmail) {
      //   await sendTimeOffRequestSubmittedEmail(
      //     userEmail,    // to
      //     userName,     // userName
      //     startDate,    // startDate
      //     endDate,      // endDate
      //     type,         // type
      //     reason        // reason (optional)
      //   );
      //   debug("Sent time off request confirmation email to user:", userEmail);
      // }
      
      // Send notification to admin(s)
      if (process.env.VERCEL || isPrismaEnabled) {
        // Get admin users with Prisma
        const adminUsers = await prisma?.user.findMany({
          where: { role: 'ADMIN' }
        });
        
        debug(`Found ${adminUsers?.length || 0} admin users to notify`);
        
        for (const admin of adminUsers || []) {
          if (admin.email && typeof sendTimeOffRequestAdminNotification === 'function') {
            await sendTimeOffRequestAdminNotification(
              admin.email,
              userName,
              startDate,
              endDate,
              type,
              id,
              reason
            );
            debug("Sent admin notification to:", admin.email);
          }
        }
      } else if (db) {
        // Get admin users with SQLite
        const admins = db.prepare(`
          SELECT * FROM users WHERE role = 'ADMIN'
        `).all() as Array<{ email: string, name: string }>;
        
        debug(`Found ${admins?.length || 0} admin users to notify`);
        
        for (const admin of admins) {
          if (admin.email && typeof sendTimeOffRequestAdminNotification === 'function') {
            await sendTimeOffRequestAdminNotification(
              admin.email,
              userName,
              startDate,
              endDate,
              type,
              id,
              reason
            );
            debug("Sent admin notification to:", admin.email);
          }
        }
      }
      
    } catch (emailError) {
      console.error("Error sending email notification:", emailError);
      // Don't fail the request if email fails
    }
    
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("Error creating time off request:", error);
    return NextResponse.json({ error: `Error creating time off request: ${error}` }, { status: 500 });
  }
} 