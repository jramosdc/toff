import { 
  UnifiedTimeOffBalance, 
  LegacyTimeOffBalance, 
  ModernTimeOffBalance,
  legacyToUnified,
  modernToUnified,
  unifiedToModern 
} from '../types/unified-balance';
import db, { dbOperations, prisma, isPrismaEnabled } from '../db';
import { randomUUID } from 'crypto';

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
        console.log("Fetching balance using SQLite");
        
        const balance = dbOperations.getUserTimeOffBalance(userId, year) as LegacyTimeOffBalance | undefined;
        
        if (!balance) {
          return null;
        }

        return legacyToUnified(balance);
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
        console.log("Updating balance using SQLite");
        
        const legacy: LegacyTimeOffBalance = {
          id: balance.id,
          user_id: balance.userId,
          vacation_days: balance.vacationDays,
          sick_days: balance.sickDays,
          paid_leave: balance.paidLeave,
          personal_days: balance.personalDays,
          year: balance.year,
        };

        // Try to update existing, create if not exists
        try {
          dbOperations.updateTimeOffBalance.run(
            legacy.vacation_days,
            legacy.sick_days,
            legacy.paid_leave,
            legacy.personal_days,
            legacy.user_id,
            legacy.year
          );
        } catch {
          // If update fails, create new
          dbOperations.createTimeOffBalance.run(
            legacy.id,
            legacy.user_id,
            legacy.vacation_days,
            legacy.sick_days,
            legacy.paid_leave,
            legacy.personal_days,
            legacy.year
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