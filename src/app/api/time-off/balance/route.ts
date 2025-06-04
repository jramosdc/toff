import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { unifiedBalanceService } from '@/lib/services/unified-balance';
import { UnifiedTimeOffBalance } from '@/lib/types/unified-balance';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const currentYear = new Date().getFullYear();
    
    // Use unified service to get balance
    let balance = await unifiedBalanceService.getUserBalance(session.user.id, currentYear);

    // Create initial balance if none exists
    if (!balance) {
      console.log('No balance found, creating initial balance for user:', session.user.id);
      balance = await unifiedBalanceService.createInitialBalance(session.user.id, currentYear);
    }

    // Return in the format expected by frontend (camelCase)
    const response = {
      id: balance.id,
      userId: balance.userId,
      year: balance.year,
      vacationDays: balance.vacationDays,
      sickDays: balance.sickDays,
      paidLeave: balance.paidLeave,
      personalDays: balance.personalDays,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching balance:', error);
    return NextResponse.json(
      { error: 'Failed to fetch balance' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { vacationDays, sickDays, paidLeave, personalDays } = body;
    const currentYear = new Date().getFullYear();

    // Get current balance
    let balance = await unifiedBalanceService.getUserBalance(session.user.id, currentYear);

    if (!balance) {
      // Create new balance if none exists
      balance = await unifiedBalanceService.createInitialBalance(session.user.id, currentYear);
    }

    // Update only provided fields
    if (vacationDays !== undefined) balance.vacationDays = vacationDays;
    if (sickDays !== undefined) balance.sickDays = sickDays;
    if (paidLeave !== undefined) balance.paidLeave = paidLeave;
    if (personalDays !== undefined) balance.personalDays = personalDays;

    balance.updatedAt = new Date();

    // Save updated balance
    await unifiedBalanceService.updateUserBalance(balance);

    // Return updated balance
    const response = {
      id: balance.id,
      userId: balance.userId,
      year: balance.year,
      vacationDays: balance.vacationDays,
      sickDays: balance.sickDays,
      paidLeave: balance.paidLeave,
      personalDays: balance.personalDays,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error updating balance:', error);
    return NextResponse.json(
      { error: 'Failed to update balance' },
      { status: 500 }
    );
  }
} 