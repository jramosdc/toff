import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db, { dbOperations, prisma, isPrismaEnabled } from '@/lib/db';
import { randomUUID } from 'crypto';

// Define TimeOffBalance type for legacy SQLite
interface LegacyTimeOffBalance {
  id: string;
  user_id: string;
  vacation_days: number;
  sick_days: number;
  paid_leave: number;
  personal_days: number;
  year: number;
  created_at?: string;
  updated_at?: string;
}

// Define the response format for production (new schema) - this will work with Vercel
interface ModernTimeOffBalance {
  id: string;
  userId: string;
  year: number;
  type: 'VACATION' | 'SICK' | 'PAID_LEAVE' | 'PERSONAL';
  totalDays: number;
  usedDays: number;
  remainingDays: number;
}

// Define the response format that matches the frontend expectations
interface AdminBalanceResponse {
  id: string;
  userId: string;
  vacationDays: number;
  sickDays: number;
  paidLeave: number;
  personalDays: number;
  year: number;
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
    
    // Use Prisma in production (new schema with separate balance records)
    if (process.env.VERCEL || (isPrismaEnabled && prisma)) {
      console.log("Using Prisma to get user balance");
      
      if (!prisma) {
        throw new Error("Prisma client not available");
      }
      
      // Check if user exists
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });
      
      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      
      // Get all balance records for this user and year using raw query for compatibility
      const balances = await prisma.$queryRaw<ModernTimeOffBalance[]>`
        SELECT * FROM "TimeOffBalance" 
        WHERE "userId" = ${userId} AND "year" = ${year}
      `;
      
      // Initialize response with defaults
      const response: AdminBalanceResponse = {
        id: `${userId}-${year}`, // Composite ID for frontend
        userId,
        vacationDays: 22,
        sickDays: 8,
        paidLeave: 0,
        personalDays: 3,
        year
      };
      
      // Map balance records to response format
      for (const balance of balances) {
        switch (balance.type) {
          case 'VACATION':
            response.vacationDays = balance.totalDays;
            break;
          case 'SICK':
            response.sickDays = balance.totalDays;
            break;
          case 'PAID_LEAVE':
            response.paidLeave = balance.totalDays;
            break;
          case 'PERSONAL':
            response.personalDays = balance.totalDays;
            break;
        }
      }
      
      // Create missing balance records with defaults if none exist
      if (balances.length === 0) {
        const defaultBalances = [
          { type: 'VACATION', totalDays: 22 },
          { type: 'SICK', totalDays: 8 },
          { type: 'PAID_LEAVE', totalDays: 0 },
          { type: 'PERSONAL', totalDays: 3 }
        ];
        
        for (const defaultBalance of defaultBalances) {
          await prisma.$executeRaw`
            INSERT INTO "TimeOffBalance" ("id", "userId", "year", "type", "totalDays", "usedDays", "remainingDays", "createdAt", "updatedAt")
            VALUES (${randomUUID()}, ${userId}, ${year}, ${defaultBalance.type}::"TimeOffType", ${defaultBalance.totalDays}, 0, ${defaultBalance.totalDays}, NOW(), NOW())
          `;
        }
      }
      
      return NextResponse.json(response);
      
    } else if (db) {
      console.log("Using SQLite to get user balance (legacy schema)");
      // Use SQLite in development (legacy schema)
      if (!dbOperations) {
        throw new Error("SQLite operations not available");
      }

      const balance = dbOperations.getUserTimeOffBalance(userId, year) as LegacyTimeOffBalance | undefined;

      if (!balance) {
        // Create default balance if none exists
        const balanceId = randomUUID();
        const defaultBalance = {
          id: balanceId,
          userId: userId,
          vacationDays: 22,
          sickDays: 8,
          paidLeave: 0,
          personalDays: 3,
          year
        };

        dbOperations.createTimeOffBalance.run(
          balanceId,
          userId,
          defaultBalance.vacationDays,
          defaultBalance.sickDays,
          defaultBalance.paidLeave,
          defaultBalance.personalDays,
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
        personalDays: balance.personal_days,
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
    const { vacationDays, sickDays, paidLeave, personalDays, year } = await request.json();
    
    if (
      typeof vacationDays !== 'number' || 
      typeof sickDays !== 'number' || 
      typeof paidLeave !== 'number' ||
      typeof personalDays !== 'number'
    ) {
      return NextResponse.json({ error: 'Invalid balance data' }, { status: 400 });
    }

    const currentYear = year || new Date().getFullYear();
    
    console.log("Updating balance for userId:", userId, "year:", currentYear);
    console.log("Balance data:", { vacationDays, sickDays, paidLeave, personalDays });
    
    // Use Prisma in production (new schema with separate balance records)
    if (process.env.VERCEL || (isPrismaEnabled && prisma)) {
      console.log("Using Prisma to update user balance");
      
      if (!prisma) {
        throw new Error("Prisma client not available");
      }
      
      // Check if user exists
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });
      
      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      
      // Define the balance updates
      const balanceUpdates = [
        { type: 'VACATION', totalDays: vacationDays },
        { type: 'SICK', totalDays: sickDays },
        { type: 'PAID_LEAVE', totalDays: paidLeave },
        { type: 'PERSONAL', totalDays: personalDays }
      ];
      
      // Update or create each balance record using raw queries for compatibility
      for (const update of balanceUpdates) {
        // Check if balance exists
        const existing = await prisma.$queryRaw<ModernTimeOffBalance[]>`
          SELECT * FROM "TimeOffBalance" 
          WHERE "userId" = ${userId} AND "year" = ${currentYear} AND "type" = ${update.type}::"TimeOffType"
          LIMIT 1
        `;
        
        if (existing.length > 0) {
          // Update existing balance
          await prisma.$executeRaw`
            UPDATE "TimeOffBalance" 
            SET "totalDays" = ${update.totalDays}, 
                "remainingDays" = ${update.totalDays} - "usedDays",
                "updatedAt" = NOW()
            WHERE "userId" = ${userId} AND "year" = ${currentYear} AND "type" = ${update.type}::"TimeOffType"
          `;
        } else {
          // Create new balance
          await prisma.$executeRaw`
            INSERT INTO "TimeOffBalance" ("id", "userId", "year", "type", "totalDays", "usedDays", "remainingDays", "createdAt", "updatedAt")
            VALUES (${randomUUID()}, ${userId}, ${currentYear}, ${update.type}::"TimeOffType", ${update.totalDays}, 0, ${update.totalDays}, NOW(), NOW())
          `;
        }
      }
      
      // Return the updated balance in the expected format
      const updatedBalance: AdminBalanceResponse = {
        id: `${userId}-${currentYear}`,
        userId,
        vacationDays,
        sickDays,
        paidLeave,
        personalDays,
        year: currentYear
      };
      
      return NextResponse.json(updatedBalance);
      
    } else if (db) {
      console.log("Using SQLite to update user balance (legacy schema)");
      
      if (!dbOperations) {
        throw new Error("SQLite operations not available");
      }
      
      // Check if balance exists first
      const existingBalance = dbOperations.getUserTimeOffBalance(userId, currentYear) as LegacyTimeOffBalance | undefined;
      
      if (existingBalance) {
        // Update existing balance - use the existing ID
        dbOperations.createOrUpdateTimeOffBalance(
          existingBalance.id, // Use existing ID, not a new one
          userId,
          vacationDays,
          sickDays,
          paidLeave,
          personalDays,
          currentYear
        );
      } else {
        // Create new balance - generate new ID only for new records
        const balanceId = randomUUID();
        dbOperations.createOrUpdateTimeOffBalance(
          balanceId,
          userId,
          vacationDays,
          sickDays,
          paidLeave,
          personalDays,
          currentYear
        );
      }

      // Get the updated balance
      const sqliteBalance = dbOperations.getUserTimeOffBalance(userId, currentYear) as LegacyTimeOffBalance;

      if (!sqliteBalance) {
        return NextResponse.json({ error: 'Failed to update balance' }, { status: 500 });
      }

      const updatedBalance = {
        id: sqliteBalance.id,
        userId: sqliteBalance.user_id,
        vacationDays: sqliteBalance.vacation_days,
        sickDays: sqliteBalance.sick_days,
        paidLeave: sqliteBalance.paid_leave,
        personalDays: sqliteBalance.personal_days,
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