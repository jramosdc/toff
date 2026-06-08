import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db, { dbOperations, prisma, isPrismaEnabled } from '@/lib/db';
import { AuditLogger } from '@/lib/audit';
import { randomUUID } from 'crypto';

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
      console.log("Using SQLite to get user balance");
      if (!dbOperations) {
        throw new Error("SQLite operations not available");
      }

      const balanceRows = dbOperations.getAllUserTimeOffBalances(userId, year) as Array<{
        type: string;
        totalDays: number;
        usedDays: number;
        remainingDays: number;
      }>;

      if (!balanceRows.length) {
        const defaults = [
          { type: 'VACATION', totalDays: 22 },
          { type: 'SICK', totalDays: 8 },
          { type: 'PAID_LEAVE', totalDays: 0 },
          { type: 'PERSONAL', totalDays: 3 },
        ];
        for (const def of defaults) {
          dbOperations.createTimeOffBalance.run(
            randomUUID(), userId, year, def.type, def.totalDays, 0, def.totalDays
          );
        }
        return NextResponse.json({
          id: `${userId}-${year}`,
          userId,
          vacationDays: 22,
          sickDays: 8,
          paidLeave: 0,
          personalDays: 3,
          year
        });
      }

      const byType = Object.fromEntries(balanceRows.map(b => [b.type, b.totalDays]));
      return NextResponse.json({
        id: `${userId}-${year}`,
        userId,
        vacationDays: byType['VACATION'] ?? 22,
        sickDays: byType['SICK'] ?? 8,
        paidLeave: byType['PAID_LEAVE'] ?? 0,
        personalDays: byType['PERSONAL'] ?? 3,
        year
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
      
      // Audit log manual balance edit
      try {
        const logger = new AuditLogger(prisma);
        await logger.log(
          session.user.id,
          'UPDATE',
          'BALANCE',
          `${userId}-${currentYear}`,
          { vacationDays, sickDays, paidLeave, personalDays }
        );
      } catch (e) {
        console.error('Failed to write audit log for balance update:', e);
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
      console.log("Using SQLite to update user balance");

      if (!dbOperations) {
        throw new Error("SQLite operations not available");
      }

      const types: Array<[string, number]> = [
        ['VACATION', vacationDays],
        ['SICK', sickDays],
        ['PAID_LEAVE', paidLeave],
        ['PERSONAL', personalDays],
      ];

      for (const [type, totalDays] of types) {
        const existing = dbOperations.getUserTimeOffBalance(userId, currentYear, type) as { usedDays: number } | undefined;
        const usedDays = existing?.usedDays ?? 0;
        dbOperations.createOrUpdateTimeOffBalance(
          randomUUID(),
          userId,
          currentYear,
          type,
          totalDays,
          usedDays,
          totalDays - usedDays
        );
      }

      return NextResponse.json({
        id: `${userId}-${currentYear}`,
        userId,
        vacationDays,
        sickDays,
        paidLeave,
        personalDays,
        year: currentYear
      });
    } else {
      throw new Error("No database connection available");
    }
    
  } catch (error) {
    console.error('Error updating balance:', error);
    return NextResponse.json({ error: `Failed to update balance: ${error}` }, { status: 500 });
  }
} 