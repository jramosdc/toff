import { PrismaClient } from '@prisma/client';
import { TimeOffType, TimeOffBalance } from './types/time-off';
import { TransactionManager } from './db/transaction';
import { AuditLogger } from './audit';
import { InsufficientBalanceError, DatabaseError } from './errors/time-off';
import { transformTimeOffBalance } from './db/transformer';

export class BalanceManager {
  constructor(
    private prisma: PrismaClient,
    private transactionManager: TransactionManager,
    private auditLogger: AuditLogger
  ) {}

  async getBalance(userId: string, year: number, type: TimeOffType): Promise<TimeOffBalance> {
    const balance = await this.prisma.timeOffBalance.findUnique({
      where: { userId_year_type: { userId, year, type } }
    });
    if (!balance) throw new DatabaseError('Balance not found');
    return transformTimeOffBalance(balance);
  }

  async updateBalance(
    userId: string,
    year: number,
    type: TimeOffType,
    days: number,
    reason: string
  ): Promise<TimeOffBalance> {
    return this.transactionManager.execute(async (tx) => {
      const balance = await this.getBalance(userId, year, type);
      const newUsedDays = balance.usedDays + days;
      const newRemainingDays = balance.totalDays - newUsedDays;

      if (newRemainingDays < 0) {
        throw new InsufficientBalanceError(type, Math.abs(days), balance.remainingDays);
      }

      const updatedBalance = await tx.timeOffBalance.update({
        where: { userId_year_type: { userId, year, type } },
        data: { usedDays: newUsedDays, remainingDays: newRemainingDays }
      });

      await this.auditLogger.log(userId, 'UPDATE', 'BALANCE', updatedBalance.id, {
        type,
        previousBalance: balance.remainingDays,
        newBalance: newRemainingDays,
        change: days,
        reason,
        year
      });

      return transformTimeOffBalance(updatedBalance);
    });
  }

  async restoreBalance(
    userId: string,
    year: number,
    type: TimeOffType,
    days: number,
    reason: string
  ): Promise<TimeOffBalance> {
    return this.updateBalance(userId, year, type, -days, reason);
  }

  async deductBalance(
    userId: string,
    year: number,
    type: TimeOffType,
    days: number,
    reason: string
  ): Promise<TimeOffBalance> {
    return this.updateBalance(userId, year, type, days, reason);
  }
}
