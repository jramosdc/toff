import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { dbOperations } from '@/lib/db';
import { randomUUID } from 'crypto';
import { authOptions } from '@/lib/auth';
import { sendTimeOffRequestSubmittedEmail } from '@/lib/email';
import db, { prisma, isPrismaEnabled } from '@/lib/db';

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
          include: { user: { select: { name: true } } }
        });
        // Transform to match the expected format
        requests = requests?.map(req => ({
          ...req,
          user_name: req.user.name
        }));
      } else {
        requests = await prisma?.timeOffRequest.findMany({
          where: { userId }
        });
      }
    } else if (db) {
      console.log("Using SQLite to fetch time off requests");
      // SQLite fallback for development
      requests = userRole === 'ADMIN'
        ? dbOperations.getTimeOffRequests?.all('PENDING')
        : dbOperations.getUserTimeOffRequests?.all(userId);
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

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sessionUserId = session.user.id;
    const userName = session.user.name || 'User';
    const userEmail = session.user.email || '';
    
    if (!sessionUserId) {
      return NextResponse.json({ error: "User ID not found in session" }, { status: 400 });
    }

    // Parse request body
    const data = await req.json();
    console.log("Received request data:", data);
    
    // Use the userId from the request, or fall back to the session user's ID
    const userId = data.userId || sessionUserId;
    const { startDate, endDate, type, reason } = data;
    
    // Validate required fields
    if (!startDate || !endDate || !type) {
      return NextResponse.json(
        { error: "Missing required fields (startDate, endDate, type)" }, 
        { status: 400 }
      );
    }

    const id = randomUUID();
    
    // Add more debug information
    console.log("DATABASE_URL:", process.env.DATABASE_URL);
    console.log("isPrismaEnabled:", isPrismaEnabled);
    console.log("Prisma client available:", !!prisma);
    console.log("Using userId:", userId);
    
    // Force use Prisma in Vercel environment
    if (process.env.VERCEL || (isPrismaEnabled && prisma)) {
      console.log("Using Prisma to create time off request");
      try {
        // First verify the user exists in the database
        const userExists = await prisma?.user.findUnique({
          where: { id: userId }
        });
        
        if (!userExists) {
          console.error(`User with ID ${userId} not found in database`);
          return NextResponse.json({
            error: "User not found in database. Please log out and log in again, or contact your administrator."
          }, { status: 404 });
        }
        
        await prisma?.timeOffRequest.create({
          data: {
            id,
            userId,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            type,
            status: 'PENDING',
            reason: reason || null,
          }
        });
        console.log("Successfully created time off request with Prisma");
      } catch (prismaError) {
        console.error("Prisma error:", prismaError);
        throw prismaError;
      }
    } else if (db) {
      console.log("Using SQLite to create time off request");
      console.log("Creating SQLite record with userId:", userId);
      dbOperations.createTimeOffRequest?.run(
        id, userId, startDate, endDate, type, reason
      );
    } else {
      throw new Error("No database connection available");
    }
    
    // Try to send email notification if function exists
    try {
      if (typeof sendTimeOffRequestSubmittedEmail === 'function' && userEmail) {
        await sendTimeOffRequestSubmittedEmail(
          userEmail,    // to
          userName,     // userName
          startDate,    // startDate
          endDate,      // endDate
          type,         // type
          reason        // reason (optional)
        );
        console.log("Sent time off request confirmation email to:", userEmail);
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

function calculateWorkingDays(start: Date, end: Date) {
  let count = 0;
  const current = new Date(start);

  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
} 