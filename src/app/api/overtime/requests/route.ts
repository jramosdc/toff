import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { dbOperations } from '@/lib/db';
import { randomUUID } from 'crypto';
import { sendOvertimeRequestNotification } from '@/lib/email';
import db, { prisma, isPrismaEnabled } from '@/lib/db';

interface TimeOffBalance {
  id: string;
  user_id: string;
  vacation_days: number;
  sick_days: number;
  paid_leave: number;
  year: number;
}

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AdminUser {
  id: string;
  email: string;
  name: string;
}

// Check if the current date is in the last week of the month
function isLastWeekOfMonth() {
  const today = new Date();
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const daysUntilEndOfMonth = lastDayOfMonth.getDate() - today.getDate();
  
  // Consider the last 7 days of the month as the last week
  return daysUntilEndOfMonth < 7;
}

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Prefer Prisma on Vercel/production if available
    if (process.env.VERCEL || (isPrismaEnabled && prisma)) {
      try {
        if (session.user.role === 'ADMIN') {
          // Pending only for admin view
          if (!prisma) {
            console.warn('Prisma expected but not available in GET /overtime/requests');
            throw new Error('Prisma client unavailable');
          }
          const rows = await prisma.$queryRaw<any[]>`
            SELECT o.*, u.name as user_name
             FROM overtime_requests o
            JOIN "User" u ON o."userId"::text = u.id
             WHERE o.status = 'PENDING'
            ORDER BY o."createdAt" DESC
          `;
          return NextResponse.json(rows);
        } else {
          if (!prisma) {
            console.warn('Prisma expected but not available in GET /overtime/requests');
            throw new Error('Prisma client unavailable');
          }
          console.log('Overtime GET: user branch (Prisma)');
          const rows = await prisma.$queryRaw<any[]>`
            SELECT *
             FROM overtime_requests
            WHERE "userId" = ${session.user.id}::uuid
            ORDER BY "createdAt" DESC
          `;
          return NextResponse.json(rows);
        }
      } catch (prismaError: any) {
        console.error('Prisma error fetching overtime requests:', prismaError);
        return NextResponse.json({ error: 'Failed to fetch overtime requests' }, { status: 500 });
      }
    }

    // SQLite fallback (local dev)
    if (dbOperations) {
      const sqliteOps = dbOperations as any;
      let requests;
      if (session.user.role === 'ADMIN') {
        requests = sqliteOps.getOvertimeRequestsByStatus.all('PENDING');
      } else {
        requests = sqliteOps.getUserOvertimeRequests.all(session.user.id);
      }
      return NextResponse.json(requests);
    }

    // No DB available
    console.warn('No database connection available in GET /overtime/requests');
    return NextResponse.json([]);
  } catch (error) {
    console.error('Error fetching overtime requests:', error);
    return NextResponse.json({ error: 'Failed to fetch overtime requests' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    let stage = 'parse-request';
    const data = await request.json();
    const { hours, notes, userId } = data;
    
    // Use userId from request or fall back to session user id
    const userIdToUse = userId || session.user.id;

    if (!userIdToUse) {
      return NextResponse.json({ error: 'User ID not found' }, { status: 400 });
    }

    // Validate hours
    if (typeof hours !== 'number' || hours <= 0) {
      return NextResponse.json({ error: 'Hours must be a positive number' }, { status: 400 });
    }

    // Check if it's the last week of the month
    if (!isLastWeekOfMonth()) {
      return NextResponse.json(
        { error: 'Overtime requests can only be submitted during the last week of the month' },
        { status: 403 }
      );
    }

    const today = new Date();
    const requestId = randomUUID();
    const month = today.getMonth() + 1; // Month (1-12)
    const year = today.getFullYear();
    const requestDate = today.toISOString().split('T')[0];
    
    console.log("DATABASE_URL:", process.env.DATABASE_URL);
    console.log("isPrismaEnabled:", isPrismaEnabled);
    console.log("Prisma client available:", !!prisma);
    console.log("Using userId for overtime request:", userIdToUse);
    
    // Use Prisma in production/Vercel environment
    if (process.env.VERCEL || (isPrismaEnabled && prisma)) {
      console.log("Using Prisma to create overtime request");
      try {
        // First verify the user exists in the database
        stage = 'verify-user';
        if (!prisma) {
          console.error('Prisma expected but not available in POST /overtime/requests');
          throw new Error('Prisma client unavailable');
        }
        const userExists = await prisma.user.findUnique({
          where: { id: userIdToUse }
        });
        
        if (!userExists) {
          console.error(`User with ID ${userIdToUse} not found in database`);
          return NextResponse.json({
            error: "User not found in database. Please log out and log in again, or contact your administrator."
          }, { status: 404 });
        }
        
        // Create the overtime request with raw SQL (managed by Prisma model/migration in DB)
        stage = 'insert-overtime';
        await prisma.$executeRawUnsafe(
          `INSERT INTO overtime_requests (id, "userId", hours, "requestDate", month, year, status, notes)
           VALUES ($1::uuid, $2::uuid, $3, $4::date, $5, $6, $7, $8)`,
          requestId,
          userIdToUse,
          hours,
          requestDate,
          month,
          year,
          'PENDING',
          notes || null
        );
        console.log("Successfully created overtime request with Prisma");
      } catch (prismaError: any) {
        console.error(`Prisma error at stage ${stage}:`, prismaError);
        const message = prismaError?.message || String(prismaError);
        throw new Error(`Stage ${stage} failed: ${message}`);
      }
    } else if (db) {
      // Fallback to SQLite in development
      console.log("Using SQLite to create overtime request");
      stage = 'sqlite-insert';
      (dbOperations as any).createOvertimeRequest.run(
        requestId,
        userIdToUse,
        hours,
        requestDate,
        month,
        year,
        'PENDING',
        notes || null
      );
    } else {
      console.error('No database connection available in POST /overtime/requests');
      return NextResponse.json({ error: 'No database connection available' }, { status: 500 });
    }

    // Send email notifications to all admin users
    try {
      // Get user details
      let user;
      
      if (process.env.VERCEL || isPrismaEnabled) {
        stage = 'fetch-user-for-email';
        user = await prisma?.user.findUnique({
          where: { id: userIdToUse }
        });
      } else {
        stage = 'sqlite-fetch-user-for-email';
        user = (dbOperations as any).getUserById.get(userIdToUse) as User;
      }
      
      if (!user) {
        console.error("Could not find user for email notification");
        return NextResponse.json({ id: requestId, status: 'PENDING' }, { status: 201 });
      }
      
      // Get admin email
      const adminEmail = process.env.ADMIN_EMAIL;
      
      if (adminEmail) {
        // If a specific admin email is configured, use that
        await sendOvertimeRequestNotification({
          employeeName: user.name,
          employeeEmail: user.email,
          hours,
          requestDate,
          notes: notes || undefined,
          adminEmail,
          requestId
        });
      } else if (process.env.VERCEL || isPrismaEnabled) {
        // Get admin users with Prisma
        stage = 'fetch-admins';
        const adminUsers = await prisma?.user.findMany({
          where: { role: 'ADMIN' }
        });
        
        for (const admin of adminUsers || []) {
          stage = 'send-email';
          await sendOvertimeRequestNotification({
            employeeName: user.name,
            employeeEmail: user.email,
            hours,
            requestDate,
            notes: notes || undefined,
            adminEmail: admin.email,
            requestId
          });
        }
      } else {
        // Get admin users with SQLite
        stage = 'sqlite-fetch-admins';
        const adminUsers = (dbOperations as any).getAdminUsers.all() as AdminUser[];
        
        for (const admin of adminUsers) {
          stage = 'send-email';
          await sendOvertimeRequestNotification({
            employeeName: user.name,
            employeeEmail: user.email,
            hours,
            requestDate,
            notes: notes || undefined,
            adminEmail: admin.email,
            requestId
          });
        }
      }
    } catch (emailError) {
      // Log email error but don't fail the request
      console.error(`Failed to send notification email at stage ${stage}:`, emailError);
    }

    return NextResponse.json({ id: requestId, status: 'PENDING' }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating overtime request:', error);
    const message = error?.message || String(error);
    return NextResponse.json({ error: `Failed to create overtime request: ${message}` }, { status: 500 });
  }
} 