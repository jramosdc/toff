import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db, { dbOperations, prisma, isPrismaEnabled } from '@/lib/db';
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

    console.log("Fetching balance for userId:", userId, "year:", year);
    console.log("DATABASE_URL:", process.env.DATABASE_URL);
    console.log("isPrismaEnabled:", isPrismaEnabled);
    console.log("Prisma client available:", !!prisma);
    console.log("VERCEL:", process.env.VERCEL);

    let balance;
    
    // Use Prisma in production
    if (process.env.VERCEL || (isPrismaEnabled && prisma)) {
      console.log("Using Prisma to get user balance");
      
      // Check if user exists
      const user = await prisma?.user.findUnique({
        where: { id: userId }
      });
      
      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      
      // Get balance from Prisma
      balance = await prisma?.timeOffBalance.findFirst({
        where: {
          userId,
          year
        }
      });
      
      if (!balance) {
        // Create default balance if none exists
        const balanceId = randomUUID();
        console.log("Creating default balance with Prisma for user:", userId);
        
        balance = await prisma?.timeOffBalance.create({
          data: {
            id: balanceId,
            userId,
            vacationDays: 22,
            sickDays: 8,
            paidLeave: 0,
            year
          }
        });
        
        return NextResponse.json(balance);
      }
      
      return NextResponse.json(balance);
      
    } else if (db) {
      console.log("Using SQLite to get user balance");
      // Use SQLite in development
      balance = dbOperations.getUserTimeOffBalance?.get(userId, year) as TimeOffBalance | undefined;

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

        dbOperations.createTimeOffBalance?.run(
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
    } else {
      throw new Error("No database connection available");
    }
    
  } catch (error) {
    console.error('Error fetching balance:', error);
    return NextResponse.json({ error: `Failed to fetch balance: ${error}` }, { status: 500 });
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

    const currentYear = year || new Date().getFullYear();
    
    console.log("Updating balance for userId:", userId, "year:", currentYear);
    console.log("Balance data:", { vacationDays, sickDays, paidLeave });
    console.log("DATABASE_URL:", process.env.DATABASE_URL);
    console.log("isPrismaEnabled:", isPrismaEnabled);
    console.log("Prisma client available:", !!prisma);
    console.log("VERCEL:", process.env.VERCEL);
    
    let updatedBalance;
    
    // Use Prisma in production
    if (process.env.VERCEL || (isPrismaEnabled && prisma)) {
      console.log("Using Prisma to update user balance");
      
      // Check if user exists
      const user = await prisma?.user.findUnique({
        where: { id: userId }
      });
      
      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      
      // Find existing balance
      const existingBalance = await prisma?.timeOffBalance.findFirst({
        where: {
          userId,
          year: currentYear
        }
      });
      
      if (existingBalance) {
        // Update existing balance
        console.log("Updating existing balance:", existingBalance.id);
        updatedBalance = await prisma?.timeOffBalance.update({
          where: { id: existingBalance.id },
          data: {
            vacationDays,
            sickDays,
            paidLeave
          }
        });
      } else {
        // Create new balance
        console.log("Creating new balance for user", userId);
        const balanceId = randomUUID();
        updatedBalance = await prisma?.timeOffBalance.create({
          data: {
            id: balanceId,
            userId,
            vacationDays,
            sickDays,
            paidLeave,
            year: currentYear
          }
        });
      }
      
      return NextResponse.json(updatedBalance);
      
    } else if (db) {
      console.log("Using SQLite to update user balance");
      
      const balanceId = randomUUID();
      
      // Use the createOrUpdateTimeOffBalance function
      dbOperations.createOrUpdateTimeOffBalance?.(
        balanceId,
        userId,
        vacationDays,
        sickDays,
        paidLeave,
        currentYear
      );

      // Get the updated balance
      const sqliteBalance = dbOperations.getUserTimeOffBalance?.get(userId, currentYear) as TimeOffBalance;

      updatedBalance = {
        id: sqliteBalance.id,
        userId: sqliteBalance.user_id,
        vacationDays: sqliteBalance.vacation_days,
        sickDays: sqliteBalance.sick_days,
        paidLeave: sqliteBalance.paid_leave,
        year: sqliteBalance.year
      };
      
      return NextResponse.json(updatedBalance);
    } else {
      throw new Error("No database connection available");
    }
    
  } catch (error) {
    console.error('Error updating balance:', error);
    return NextResponse.json({ error: `Failed to update balance: ${error}` }, { status: 500 });
  }
} 