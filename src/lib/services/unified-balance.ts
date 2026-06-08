import {
  UnifiedTimeOffBalance,
  ModernTimeOffBalance,
  modernToUnified,
  unifiedToModern
} from '../types/unified-balance';
import db, { dbOperations, prisma, isPrismaEnabled } from '../db';
import { randomUUID } from 'crypto';

interface SQLiteBalanceRow {
  id: string;
  userId: string;
  year: number;
  type: 'VACATION' | 'SICK' | 'PAID_LEAVE' | 'PERSONAL';
  totalDays: number;
  usedDays: number;
  remainingDays: number;
  createdAt: string;
  updatedAt: string;
}

export class UnifiedBalanceService {
  /**
   * Gets user balance in unified format, abstracting away schema differences
   */
  async getUserBalance(userId: string, year: number): Promise<UnifiedTimeOffBalance | null> {
    try {
      // Try production/Prisma first (Vercel environment)
      if (process.env.VERCEL || (isPrismaEnabled && prisma)) {
        console.log("Fetching balance using Prisma");
        
        const balances = await prisma?.timeOffBalance.findMany({
          where: { userId, year }
        });

        if (!balances || balances.length === 0) {
          return null;
        }

        // Cast to any to avoid TypeScript inference issues with Prisma generated types
        const modernBalances: ModernTimeOffBalance[] = (balances as any[]).map((balance: any) => ({
          id: balance.id,
          userId: balance.userId,
          year: balance.year,
          type: balance.type as 'VACATION' | 'SICK' | 'PAID_LEAVE' | 'PERSONAL',
          totalDays: Number(balance.totalDays),
          usedDays: Number(balance.usedDays),
          remainingDays: Number(balance.remainingDays),
          createdAt: balance.createdAt,
          updatedAt: balance.updatedAt,
        }));

        // Convert modern format to unified
        return modernToUnified(modernBalances);
      }
      
      // Fallback to SQLite (development)
      else if (db && dbOperations) {
        const rows = dbOperations.getAllUserTimeOffBalances(userId, year) as SQLiteBalanceRow[];

        if (!rows.length) return null;

        const byType = Object.fromEntries(rows.map(r => [r.type, r]));
        const base = rows[0];
        return {
          id: `${userId}_${year}`,
          userId,
          year,
          vacationDays: Number(byType['VACATION']?.remainingDays ?? 0),
          sickDays: Number(byType['SICK']?.remainingDays ?? 0),
          paidLeave: Number(byType['PAID_LEAVE']?.remainingDays ?? 0),
          personalDays: Number(byType['PERSONAL']?.remainingDays ?? 0),
          createdAt: base.createdAt ? new Date(base.createdAt) : undefined,
          updatedAt: base.updatedAt ? new Date(base.updatedAt) : undefined,
        };
      }
      
      throw new Error("No database connection available");
    } catch (error) {
      console.error('Error fetching user balance:', error);
      throw error;
    }
  }

  /**
   * Creates or updates user balance in unified format
   */
  async updateUserBalance(balance: UnifiedTimeOffBalance): Promise<void> {
    try {
      // Try production/Prisma first
      if (process.env.VERCEL || (isPrismaEnabled && prisma)) {
        console.log("Updating balance using Prisma");
        
        const modernBalances = unifiedToModern(balance);
        
        // Delete existing balances for this user/year
        await prisma?.timeOffBalance.deleteMany({
          where: { userId: balance.userId, year: balance.year }
        });
        
        // Create new balance records
        for (const modernBalance of modernBalances) {
          await prisma?.timeOffBalance.create({
            data: {
              id: randomUUID(),
              ...modernBalance,
            }
          });
        }
      }
      
      // Fallback to SQLite
      else if (db && dbOperations) {
        const types: Array<['VACATION' | 'SICK' | 'PAID_LEAVE' | 'PERSONAL', number]> = [
          ['VACATION', balance.vacationDays],
          ['SICK', balance.sickDays],
          ['PAID_LEAVE', balance.paidLeave],
          ['PERSONAL', balance.personalDays],
        ];

        for (const [type, days] of types) {
          dbOperations.createOrUpdateTimeOffBalance(
            randomUUID(),
            balance.userId,
            balance.year,
            type,
            days,
            0,
            days
          );
        }
      }
      
      else {
        throw new Error("No database connection available");
      }
    } catch (error) {
      console.error('Error updating user balance:', error);
      throw error;
    }
  }

  /**
   * Creates initial balance for new user
   */
  async createInitialBalance(userId: string, year: number): Promise<UnifiedTimeOffBalance> {
    const initialBalance: UnifiedTimeOffBalance = {
      id: randomUUID(),
      userId,
      year,
      vacationDays: 15, // Default values
      sickDays: 10,
      paidLeave: 5,
      personalDays: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.updateUserBalance(initialBalance);
    return initialBalance;
  }

  /**
   * Deducts days from balance for approved requests
   */
  async deductBalance(
    userId: string, 
    year: number, 
    type: 'VACATION' | 'SICK' | 'PAID_LEAVE' | 'PERSONAL', 
    days: number
  ): Promise<void> {
    const balance = await this.getUserBalance(userId, year);
    if (!balance) {
      throw new Error('User balance not found');
    }

    // Check if sufficient balance exists
    let availableDays = 0;
    switch (type) {
      case 'VACATION':
        availableDays = balance.vacationDays;
        balance.vacationDays = Math.max(0, balance.vacationDays - days);
        break;
      case 'SICK':
        availableDays = balance.sickDays;
        balance.sickDays = Math.max(0, balance.sickDays - days);
        break;
      case 'PAID_LEAVE':
        availableDays = balance.paidLeave;
        balance.paidLeave = Math.max(0, balance.paidLeave - days);
        break;
      case 'PERSONAL':
        availableDays = balance.personalDays;
        balance.personalDays = Math.max(0, balance.personalDays - days);
        break;
    }

    if (availableDays < days) {
      throw new Error(`Insufficient ${type.toLowerCase().replace('_', ' ')} days. Required: ${days}, Available: ${availableDays}`);
    }

    balance.updatedAt = new Date();
    await this.updateUserBalance(balance);
  }

  /**
   * Restores days to balance (for canceled/rejected requests)
   */
  async restoreBalance(
    userId: string, 
    year: number, 
    type: 'VACATION' | 'SICK' | 'PAID_LEAVE' | 'PERSONAL', 
    days: number
  ): Promise<void> {
    const balance = await this.getUserBalance(userId, year);
    if (!balance) {
      return; // Nothing to restore if no balance exists
    }

    switch (type) {
      case 'VACATION':
        balance.vacationDays += days;
        break;
      case 'SICK':
        balance.sickDays += days;
        break;
      case 'PAID_LEAVE':
        balance.paidLeave += days;
        break;
      case 'PERSONAL':
        balance.personalDays += days;
        break;
    }

    balance.updatedAt = new Date();
    await this.updateUserBalance(balance);
  }
}

// Export singleton instance
export const unifiedBalanceService = new UnifiedBalanceService(); 