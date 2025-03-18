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

  console.log('Session user in requests GET:', session.user); // Debug log

  const userId = session.user.id;
  const userRole = session.user.role;
  
  if (!userId) {
    return new NextResponse(JSON.stringify({ error: 'User ID not found in session' }), {
      status: 400,
    });
  }
  
  const requests = userRole === 'ADMIN'
    ? dbOperations.getTimeOffRequests.all('PENDING')
    : dbOperations.getUserTimeOffRequests.all(userId);

  console.log('Time off requests from DB:', JSON.stringify(requests, null, 2));
  
  return new NextResponse(JSON.stringify(requests));
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId, startDate, endDate, type, reason } = await req.json();
    const id = randomUUID();
    
    console.log("Database mode:", isPrismaEnabled ? "PostgreSQL (Prisma)" : "SQLite");
    
    // Use Prisma in production (PostgreSQL), SQLite in development
    if (isPrismaEnabled && prisma) {
      console.log("Using Prisma to create time off request");
      await prisma.timeOffRequest.create({
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
    } else if (db) {
      console.log("Using SQLite to create time off request");
      dbOperations.createTimeOffRequest.run(
        id, userId, startDate, endDate, type, reason
      );
    } else {
      throw new Error("No database connection available");
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