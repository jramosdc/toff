import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { dbOperations } from '@/lib/db';
import { randomUUID } from 'crypto';

// Define TimeOffBalance type
interface TimeOffBalance {
  id: string;
  user_id: string;
  vacation_days: number;
  sick_days: number;
  paid_leave: number;
  year: number;
  created_at?: string;
  updated_at?: string;
}

export async function GET(
  request: Request,
  { params }: { params: { userId: string } }
) {
  const session = await getServerSession(authOptions);
  const userId = params.userId;

  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get year from query params or use current year
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString());

    // Get user balance
    const balance = dbOperations.getUserTimeOffBalance.get(userId, year) as TimeOffBalance | undefined;

    if (!balance) {
      // Create default balance if none exists
      const balanceId = randomUUID();
      const defaultBalance = {
        id: balanceId,
        userId: userId,
        vacationDays: 22,
        sickDays: 8,
        paidLeave: 0,
        year
      };

      dbOperations.createTimeOffBalance.run(
        balanceId,
        userId,
        defaultBalance.vacationDays,
        defaultBalance.sickDays,
        defaultBalance.paidLeave,
        year
      );

      return NextResponse.json(defaultBalance);
    }

    return NextResponse.json({
      id: balance.id,
      userId: balance.user_id,
      vacationDays: balance.vacation_days,
      sickDays: balance.sick_days,
      paidLeave: balance.paid_leave,
      year: balance.year
    });
  } catch (error) {
    console.error('Error fetching balance:', error);
    return NextResponse.json({ error: 'Failed to fetch balance' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { userId: string } }
) {
  const session = await getServerSession(authOptions);
  const userId = params.userId;

  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { vacationDays, sickDays, paidLeave, year } = await request.json();
    
    if (typeof vacationDays !== 'number' || typeof sickDays !== 'number' || typeof paidLeave !== 'number') {
      return NextResponse.json({ error: 'Invalid balance data' }, { status: 400 });
    }

    const balanceId = randomUUID();
    const currentYear = year || new Date().getFullYear();

    // Use the createOrUpdateTimeOffBalance function
    dbOperations.createOrUpdateTimeOffBalance(
      balanceId,
      userId,
      vacationDays,
      sickDays,
      paidLeave,
      currentYear
    );

    // Get the updated balance
    const updatedBalance = dbOperations.getUserTimeOffBalance.get(userId, currentYear) as TimeOffBalance;

    return NextResponse.json({
      id: updatedBalance.id,
      userId: updatedBalance.user_id,
      vacationDays: updatedBalance.vacation_days,
      sickDays: updatedBalance.sick_days,
      paidLeave: updatedBalance.paid_leave,
      year: updatedBalance.year
    });
  } catch (error) {
    console.error('Error updating balance:', error);
    return NextResponse.json({ error: 'Failed to update balance' }, { status: 500 });
  }
} 