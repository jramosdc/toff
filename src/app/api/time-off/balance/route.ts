import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { dbOperations } from '@/lib/db';
import { randomUUID } from 'crypto';
import { authOptions } from '@/lib/auth';

interface TimeOffBalance {
  id: string;
  userId: string;
  vacationDays: number;
  sickDays: number;
  paidLeave: number;
  year: number;
}

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
    });
  }

  console.log('Session user:', session.user); // Debug log

  const currentYear = new Date().getFullYear();
  const userId = session.user.id;
  
  if (!userId) {
    return new NextResponse(JSON.stringify({ error: 'User ID not found in session' }), {
      status: 400,
    });
  }

  const balance = dbOperations.getTimeOffBalance.get(userId, currentYear) as TimeOffBalance | undefined;

  if (!balance) {
    // Create initial balance for new users
    const initialBalance: TimeOffBalance = {
      id: randomUUID(),
      userId,
      vacationDays: 15, // Default values - adjust as needed
      sickDays: 10,
      paidLeave: 5,
      year: currentYear,
    };

    console.log('Creating initial balance:', initialBalance); // Debug log

    dbOperations.createTimeOffBalance.run(
      initialBalance.id,
      initialBalance.userId,
      initialBalance.vacationDays,
      initialBalance.sickDays,
      initialBalance.paidLeave,
      initialBalance.year
    );

    return new NextResponse(JSON.stringify(initialBalance));
  }

  return new NextResponse(JSON.stringify(balance));
} 