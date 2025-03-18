import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { dbOperations } from '@/lib/db';
import db from '@/lib/db';
import { sendRequestStatusNotification } from '@/lib/email';

interface OvertimeRequest {
  id: string;
  user_id: string;
  hours: number;
  request_date: string;
  month: number;
  year: number;
  status: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

export async function PATCH(
  request: Request,
  { params }: { params: { requestId: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const requestId = params.requestId;

  try {
    const { status } = await request.json();

    if (!status || !['APPROVED', 'REJECTED'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    // Get the specific overtime request by ID
    // We need to create a custom query for this since it's not in our prepared statements
    const overtimeRequest = db.prepare(`
      SELECT * FROM overtime_requests WHERE id = ? AND status = 'PENDING'
    `).get(requestId) as OvertimeRequest | undefined;
    
    if (!overtimeRequest) {
      return NextResponse.json({ error: 'Overtime request not found or not pending' }, { status: 404 });
    }

    // Update the status
    dbOperations.updateOvertimeRequestStatus.run(status, requestId);

    // If approved, add vacation days
    if (status === 'APPROVED') {
      dbOperations.addVacationDaysFromOvertime(
        overtimeRequest.user_id,
        overtimeRequest.hours,
        overtimeRequest.year
      );
    }

    // Send email notification to the employee
    try {
      // Get employee details
      const user = dbOperations.getUserById.get(overtimeRequest.user_id) as User;
      
      if (user) {
        await sendRequestStatusNotification({
          employeeName: user.name,
          employeeEmail: user.email,
          requestType: 'Overtime Compensation',
          status: status as 'APPROVED' | 'REJECTED'
        });
      }
    } catch (emailError) {
      // Log email error but don't fail the request
      console.error('Failed to send status notification email:', emailError);
    }

    return NextResponse.json({ id: requestId, status });
  } catch (error) {
    console.error('Error updating overtime request:', error);
    return NextResponse.json({ error: 'Failed to update overtime request' }, { status: 500 });
  }
} 