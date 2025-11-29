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
import { CreateTimeOffRequestSchema } from '@/lib/validators/schemas';
import { validateRequest, createErrorResponse } from '@/lib/validators/middleware';

interface TimeOffBalance {
  vacationDays: number;
  sickDays: number;
  paidLeave: number;
}

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return createErrorResponse('Unauthorized', 'UNAUTHORIZED', 401);
  }

  console.log('Session user in requests GET:', session.user);

  const userId = session.user.id;
  const userRole = session.user.role;
  
  if (!userId) {
    return createErrorResponse('User ID not found in session', 'MISSING_USER_ID', 400);
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
        if (typeof dbOperations !== 'undefined' && dbOperations) {
          requests = userRole === 'ADMIN'
            ? dbOperations.getTimeOffRequests?.('PENDING')
            : dbOperations.getUserTimeOffRequests?.(userId);
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
    return createErrorResponse(`Error fetching requests: ${error}`, 'FETCH_ERROR', 500);
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
      return createErrorResponse('Not authenticated', 'UNAUTHORIZED', 401);
    }
    
    // Get user info for notifications
    const userId = session.user.id;
    const userName = session.user.name || 'User';
    const userEmail = session.user.email || '';
    debug('Session user:', { userId, userName, userEmail });
    
    // Parse and validate request body
    let body;
    try {
      body = await req.json();
    } catch (error) {
      return createErrorResponse('Invalid JSON in request body', 'INVALID_JSON', 400);
    }
    
    // Validate the request data
    const validation = validateRequest(CreateTimeOffRequestSchema, body);
    if (!validation.success) {
      return createErrorResponse(
        'Validation failed',
        'VALIDATION_ERROR',
        400,
        validation.errors
      );
    }
    
    const validatedData = validation.data;
    debug('Validated request data:', validatedData);
    
    // Use provided userId or fall back to session user id
    const effectiveUserId = validatedData.userId || userId;
    debug('Effective userId:', effectiveUserId);
    
    let id: string;
    
    if (process.env.VERCEL || isPrismaEnabled) {
      debug('Using Prisma to create time off request');
      
      // Create request in Postgres with Prisma
      const startDateObj = new Date(validatedData.startDate);
      const endDateObj = new Date(validatedData.endDate);
      
      // Set time components to ensure consistent date handling
      startDateObj.setHours(0, 0, 0, 0);
      endDateObj.setHours(23, 59, 59, 999);
      
      // Check for existing request with same parameters
      const existingRequest = await prisma?.timeOffRequest.findFirst({
        where: {
          userId: effectiveUserId,
          startDate: startDateObj,
          endDate: endDateObj,
          type: validatedData.type,
          status: {
            in: ['PENDING', 'APPROVED']  // Don't allow if there's already a pending or approved request
          }
        }
      });
      
      if (existingRequest) {
        return createErrorResponse(
          `A ${validatedData.type.toLowerCase().replace('_', ' ')} request for these dates already exists with status: ${existingRequest.status}. Please check your existing requests or modify the dates.`,
          'DUPLICATE_REQUEST',
          400
        );
      }
      
      // Calculate working days
      const workingDays = calculateWorkingDays(startDateObj, endDateObj);
      
      try {
        const request = await prisma?.timeOffRequest.create({
          data: {
            userId: effectiveUserId,
            startDate: startDateObj,
            endDate: endDateObj,
            type: validatedData.type,
            status: 'PENDING',
            reason: validatedData.reason || null,
            workingDays
          },
          include: {
            user: true
          }
        });
        
        id = request?.id as string;
        debug('Time off request created with ID:', id);
        
      } catch (prismaError: any) {
        console.error('Prisma error creating request:', prismaError);
        
        // Handle specific Prisma errors
        if (prismaError.code === 'P2002') {
          return createErrorResponse(
            `A ${validatedData.type.toLowerCase().replace('_', ' ')} request for these exact dates already exists. Please check your existing requests or choose different dates.`,
            'DUPLICATE_REQUEST',
            400
          );
        }
        
        // Handle other Prisma errors
        return createErrorResponse(
          `Failed to create time off request: ${prismaError.message || prismaError}`,
          'PRISMA_ERROR',
          500
        );
      }
    } else if (db) {
      debug('Using SQLite to create time off request');
      // Create request in SQLite
      id = uuidv4();
      const startDateObj = new Date(validatedData.startDate);
      const endDateObj = new Date(validatedData.endDate);
      
      // Set time components to ensure consistent date handling
      startDateObj.setHours(0, 0, 0, 0);
      endDateObj.setHours(23, 59, 59, 999);
      
      // Check for existing request with same parameters
      const existingRequest = db.prepare(`
        SELECT * FROM time_off_requests 
        WHERE user_id = ? 
        AND start_date = ? 
        AND end_date = ? 
        AND type = ? 
        AND status IN ('PENDING', 'APPROVED')
      `).get(
        effectiveUserId, 
        startDateObj.toISOString(), 
        endDateObj.toISOString(), 
        validatedData.type
      ) as { status: string } | undefined;
      
      if (existingRequest) {
        return createErrorResponse(
          `A ${validatedData.type.toLowerCase().replace('_', ' ')} request for these dates already exists with status: ${existingRequest.status}. Please check your existing requests or modify the dates.`,
          'DUPLICATE_REQUEST',
          400
        );
      }
      
      // Calculate working days
      const workingDays = calculateWorkingDays(startDateObj, endDateObj);
      
      try {
        const statement = db.prepare(`
          INSERT INTO time_off_requests (
            id, user_id, type, start_date, end_date, working_days, status, reason
          ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)
        `);
        
        statement.run(
          id, 
          effectiveUserId, 
          validatedData.type,
          startDateObj.toISOString(), 
          endDateObj.toISOString(), 
          workingDays,
          validatedData.reason || null
        );
        debug('SQLite request created with ID:', id);
        
      } catch (sqliteError: any) {
        console.error('SQLite error creating request:', sqliteError);
        
        // Handle SQLite unique constraint errors
        if (sqliteError.message && sqliteError.message.includes('UNIQUE constraint failed')) {
          return createErrorResponse(
            `A ${validatedData.type.toLowerCase().replace('_', ' ')} request for these exact dates already exists. Please check your existing requests or choose different dates.`,
            'DUPLICATE_REQUEST',
            400
          );
        }
        
        // Handle other SQLite errors
        return createErrorResponse(
          `Failed to create time off request: ${sqliteError.message || sqliteError}`,
          'SQLITE_ERROR',
          500
        );
      }
    } else {
      throw new Error("No database connection available");
    }
    
    // Try to send email notification
    try {
      if (process.env.VERCEL || isPrismaEnabled) {
        // Fetch full user details to check for supervisor
        const userDetails = await prisma?.user.findUnique({
          where: { id: effectiveUserId },
          include: { supervisor: true }
        });

        const supervisorEmail = userDetails?.supervisor?.email;
        
        if (supervisorEmail && typeof sendTimeOffRequestAdminNotification === 'function') {
          // Send to supervisor
          debug(`Sending notification to supervisor: ${supervisorEmail}`);
          await sendTimeOffRequestAdminNotification(
            supervisorEmail,
            userName,
            validatedData.startDate,
            validatedData.endDate,
            validatedData.type,
            id,
            validatedData.reason
          );
        } else {
          // Fallback: Send to all admins
          const adminUsers = await prisma?.user.findMany({
            where: { role: 'ADMIN' }
          });
          
          debug(`Found ${adminUsers?.length || 0} admin users to notify`);
          
          for (const admin of adminUsers || []) {
            if (admin.email && typeof sendTimeOffRequestAdminNotification === 'function') {
              try {
                await sendTimeOffRequestAdminNotification(
                  admin.email,
                  userName,
                  validatedData.startDate,
                  validatedData.endDate,
                  validatedData.type,
                  id,
                  validatedData.reason
                );
                debug("Sent admin notification to:", admin.email);
              } catch (emailError) {
                console.error(`Failed to send email to admin ${admin.email}:`, emailError);
              }
            }
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
            try {
              await sendTimeOffRequestAdminNotification(
                admin.email,
                userName,
                validatedData.startDate,
                validatedData.endDate,
                validatedData.type,
                id,
                validatedData.reason
              );
              debug("Sent admin notification to:", admin.email);
            } catch (emailError) {
              console.error(`Failed to send email to admin ${admin.email}:`, emailError);
            }
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
    return createErrorResponse(`Error creating time off request: ${error}`, 'INTERNAL_ERROR', 500);
  }
} 