import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { dbOperations } from '@/lib/db';
import { randomUUID } from 'crypto';
import { sendOvertimeRequestNotification } from '@/lib/email';

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
    let requests;
    
    // If admin, get all pending requests
    if (session.user.role === 'ADMIN') {
      requests = dbOperations.getAllOvertimeRequests.all('PENDING');
    } else {
      // Otherwise, get only the user's requests
      requests = dbOperations.getUserOvertimeRequests.all(session.user.id);
    }
    
    return NextResponse.json(requests);
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
    const { hours, notes } = await request.json();

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
    
    // Create overtime request
    dbOperations.createOvertimeRequest.run(
      requestId,
      session.user.id,
      hours,
      today.toISOString().split('T')[0],
      today.getMonth() + 1, // Month (1-12)
      today.getFullYear(),  // Year
      notes || null
    );

    // Send email notifications to all admin users
    try {
      // Get user details for the notification
      const user = dbOperations.getUserById.get(session.user.id) as User;
      
      // Get all admin users and send them notifications
      const adminEmail = process.env.ADMIN_EMAIL;
      
      if (adminEmail) {
        // If a specific admin email is configured, use that
        await sendOvertimeRequestNotification({
          employeeName: user.name,
          employeeEmail: user.email,
          hours,
          requestDate: today.toISOString().split('T')[0],
          notes: notes || undefined,
          adminEmail,
          requestId
        });
      } else {
        // Otherwise, notify all admin users in the system
        const adminUsers = dbOperations.getAdminUsers.all() as AdminUser[];
        
        for (const admin of adminUsers) {
          await sendOvertimeRequestNotification({
            employeeName: user.name,
            employeeEmail: user.email,
            hours,
            requestDate: today.toISOString().split('T')[0],
            notes: notes || undefined,
            adminEmail: admin.email,
            requestId
          });
        }
      }
    } catch (emailError) {
      // Log email error but don't fail the request
      console.error('Failed to send notification email:', emailError);
    }

    return NextResponse.json({ id: requestId, status: 'PENDING' }, { status: 201 });
  } catch (error) {
    console.error('Error creating overtime request:', error);
    return NextResponse.json({ error: 'Failed to create overtime request' }, { status: 500 });
  }
} 