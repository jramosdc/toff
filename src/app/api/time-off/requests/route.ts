import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { dbOperations } from '@/lib/db';
import { randomUUID } from 'crypto';
import { authOptions } from '@/lib/auth';
import { sendTimeOffRequestSubmittedEmail } from '@/lib/email';
import db from '@/lib/db';

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

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { startDate, endDate, type, reason } = await request.json();

    if (!startDate || !endDate || !type) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format' },
        { status: 400 }
      );
    }

    if (start > end) {
      return NextResponse.json(
        { error: 'Start date must be before end date' },
        { status: 400 }
      );
    }
    
    // Create the request
    const requestId = randomUUID();
    dbOperations.createTimeOffRequest.run(
      requestId,
      session.user.id,
      startDate,
      endDate,
      type,
      reason || null
    );
    
    // Get the user information for the email
    const userQuery = `SELECT * FROM users WHERE id = ?`;
    const user = db.prepare(userQuery).get(session.user.id) as {
      id: string;
      email: string;
      name: string;
    } | undefined;
    
    // Send email notification about the submitted request
    if (user) {
      await sendTimeOffRequestSubmittedEmail(
        user.email,
        user.name,
        startDate,
        endDate,
        type,
        reason
      );
      
      // Also notify admins about the new request
      const adminQuery = `SELECT * FROM users WHERE role = 'ADMIN'`;
      const admins = db.prepare(adminQuery).all() as {
        id: string;
        email: string;
        name: string;
      }[];
      
      // Send notification to each admin
      for (const admin of admins) {
        if (admin.id !== session.user.id) { // Don't notify if the admin is creating their own request
          await sendTimeOffRequestSubmittedEmail(
            admin.email,
            `Admin ${admin.name}`,
            startDate,
            endDate,
            type,
            `Request from ${user.name}: ${reason || 'No reason provided'}`
          );
        }
      }
    }

    return NextResponse.json({ id: requestId, status: 'PENDING' });
  } catch (error) {
    console.error('Error creating time off request:', error);
    return NextResponse.json(
      { error: 'Failed to create time off request' },
      { status: 500 }
    );
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