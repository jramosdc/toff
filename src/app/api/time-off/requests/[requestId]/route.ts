import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db from '@/lib/db';
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
    const query = `
      SELECT * FROM time_off_requests 
      WHERE id = ? AND user_id = ?
    `;
    const timeOffRequest = db.prepare(query).get(params.requestId, session.user.id);

    if (!timeOffRequest) {
      return NextResponse.json({ error: 'Time off request not found' }, { status: 404 });
    }

    return NextResponse.json(timeOffRequest);
  } catch (error) {
    console.error('Error fetching time off request:', error);
    return NextResponse.json(
      { error: 'Failed to fetch time off request' },
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
  } catch (error) {
    console.error('Error updating time off request:', error);
    return NextResponse.json(
      { error: 'Failed to update time off request' },
      { status: 500 }
    );
  }
} 