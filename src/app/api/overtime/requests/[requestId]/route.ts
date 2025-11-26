import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db, { prisma, isPrismaEnabled, dbOperations } from '@/lib/db';
import { AuditLogger } from '@/lib/audit';
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

    let overtimeRequest: OvertimeRequest | undefined;

    if (process.env.VERCEL || (isPrismaEnabled && prisma)) {
      // Prisma/Postgres path
      if (!prisma) {
        return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
      }

      // Fetch pending request
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id, "userId" as user_id, hours, to_char("requestDate", 'YYYY-MM-DD') as request_date, month, year, status, notes
         FROM overtime_requests
         WHERE id = $1::uuid AND status = 'PENDING'`,
        requestId
      );
      overtimeRequest = rows?.[0];
    
    if (!overtimeRequest) {
      return NextResponse.json({ error: 'Overtime request not found or not pending' }, { status: 404 });
    }

      // Update status
      await prisma.$executeRawUnsafe(
        `UPDATE overtime_requests SET status = $1, "updatedAt" = now() WHERE id = $2::uuid`,
        status,
        requestId
      );

      // If approved, add vacation days (hours/8) to TimeOffBalance for current year and VACATION
      if (status === 'APPROVED') {
        const daysToAdd = overtimeRequest.hours / 8;
        // Update then create fallback to avoid compound unique typings
        const existing = await prisma.timeOffBalance.findFirst({
          where: { userId: overtimeRequest.user_id, year: overtimeRequest.year, type: 'VACATION' }
        });
        if (existing) {
          await prisma.timeOffBalance.update({
            where: { id: existing.id },
            data: {
              totalDays: { increment: daysToAdd },
              remainingDays: { increment: daysToAdd }
            }
          });
        } else {
          await prisma.timeOffBalance.create({
            data: {
              userId: overtimeRequest.user_id,
              year: overtimeRequest.year,
              type: 'VACATION',
              totalDays: daysToAdd,
              usedDays: 0,
              remainingDays: daysToAdd
            }
          });
        }
      }

      // Audit log
      try {
        const logger = new AuditLogger(prisma);
        await logger.log(
          session.user.id,
          'UPDATE',
          'REQUEST',
          requestId,
          { action: 'OVERTIME_STATUS', newStatus: status }
        );
        if (status === 'APPROVED') {
          await logger.log(
            session.user.id,
            'UPDATE',
            'BALANCE',
            `${overtimeRequest.user_id}-${overtimeRequest.year}-VACATION`,
            { action: 'OVERTIME_APPROVED_ADD_DAYS', daysAdded: overtimeRequest.hours / 8 }
          );
        }
      } catch (e) {
        console.error('Failed to write audit log for overtime PATCH:', e);
      }
    } else {
      // SQLite path (local dev)
      // Get the specific overtime request by ID
      if (!db) {
        return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
      }
      const sqliteRequest = db.prepare(`
        SELECT * FROM overtime_requests WHERE id = ? AND status = 'PENDING'
      `).get(requestId) as OvertimeRequest | undefined;
      
      if (!sqliteRequest) {
        return NextResponse.json({ error: 'Overtime request not found or not pending' }, { status: 404 });
      }
      overtimeRequest = sqliteRequest;

    // Update the status
      if (!dbOperations) {
        return NextResponse.json({ error: 'Database operations unavailable' }, { status: 500 });
      }
    dbOperations.updateOvertimeRequestStatus.run(status, requestId);

    // If approved, add vacation days
    if (status === 'APPROVED') {
      dbOperations.addVacationDaysFromOvertime(
        overtimeRequest.user_id,
        overtimeRequest.hours,
        overtimeRequest.year
      );
      }
    }

    // Send email notification to the employee
    try {
      // Get employee details
      let user: User | undefined;
      if (process.env.VERCEL || (isPrismaEnabled && prisma)) {
        const row = await prisma?.user.findUnique({ where: { id: overtimeRequest.user_id } });
        if (row) {
          user = { id: row.id, email: row.email, name: row.name, role: row.role } as unknown as User;
        }
      } else {
        user = (dbOperations as any).getUserById.get(overtimeRequest.user_id) as User;
      }
      
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