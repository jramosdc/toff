import { PrismaClient } from '@prisma/client';
import { TimeOffType, TimeOffBalance } from './types/time-off';
import { TransactionManager } from './db/transaction';
import { AuditLogger } from './audit';
import { InsufficientBalanceError, DatabaseError } from './errors/time-off';
import { DatabaseAdapter, createDatabaseAdapter } from './db/adapter';
import { transformTimeOffBalance, createTimeOffBalanceInput } from './db/transformer';

export class BalanceManager {
  private adapter: DatabaseAdapter;

  constructor(
    private prisma: PrismaClient,
    private transactionManager: TransactionManager,
    private auditLogger: AuditLogger
  ) {
    this.adapter = createDatabaseAdapter(prisma);
  }

  async getBalance(userId: string, year: number, type: TimeOffType): Promise<TimeOffBalance> {
    try {
      if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
        const balance = await this.prisma.timeOffBalance.findUnique({
          where: {
            userId_year_type: {
              userId,
              year,
              type
            }
          }
        });
        if (!balance) {
          throw new DatabaseError('Balance not found');
        }
        return transformTimeOffBalance(balance);
      } else if (process.env.NODE_ENV === 'development') {
        const balance = await this.adapter.execute(`
          SELECT * FROM TimeOffBalance
          WHERE user_id = ${userId} 
            AND year = ${year}
            AND type = ${type}
          LIMIT 1
        `);

        if (!balance) {
          throw new DatabaseError('Balance not found');
        }

        return transformTimeOffBalance(balance);
      }
      throw new DatabaseError('Unsupported environment');
    } catch (error) {
      if (error instanceof DatabaseError) {
        throw error;
      }
      throw new DatabaseError('Failed to fetch balance');
    }
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
        throw new InsufficientBalanceError(
          type,
          Math.abs(days),
          balance.remainingDays
        );
      }

      try {
        if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
          const updatedBalance = await tx.timeOffBalance.update({
            where: {
              userId_year_type: {
                userId,
                year,
                type
              }
            },
            data: {
              usedDays: newUsedDays,
              remainingDays: newRemainingDays
            }
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
        } else if (process.env.NODE_ENV === 'development') {
          await this.adapter.execute(`
            UPDATE TimeOffBalance
            SET used_days = ${newUsedDays},
                remaining_days = ${newRemainingDays},
                updated_at = ${new Date().toISOString()}
            WHERE user_id = ${userId} 
              AND year = ${year}
              AND type = ${type}
          `);

          const updatedBalance = await this.getBalance(userId, year, type);
          await this.auditLogger.log(userId, 'UPDATE', 'BALANCE', updatedBalance.id, {
            type,
            previousBalance: balance.remainingDays,
            newBalance: newRemainingDays,
            change: days,
            reason,
            year
          });

          return updatedBalance;
        }
        throw new DatabaseError('Unsupported environment');
      } catch (error) {
        throw new DatabaseError('Failed to update balance');
      }
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