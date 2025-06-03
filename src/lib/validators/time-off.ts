import { PrismaClient } from '@prisma/client';
import { TimeOffType, TimeOffValidationRules, ValidationResult, ValidationError } from '../types/time-off';
import { DatabaseError } from '../errors/time-off';
import { calculateWorkingDays, validateDateRange, validateNoticePeriod } from '../date-utils';

export class TimeOffValidator {
  constructor(
    private prisma: PrismaClient,
    private rules: TimeOffValidationRules
  ) {}

  async validateRequest(params: {
    userId: string;
    type: TimeOffType;
    startDate: Date;
    endDate: Date;
    reason?: string;
  }): Promise<ValidationResult> {
    const errors: ValidationError[] = [];

    try {
      // Validate date range
      const dateRangeValidation = validateDateRange(
        params.startDate,
        params.endDate,
        this.rules.blackoutDates,
        this.rules.maxConsecutiveDays
      );
      if (!dateRangeValidation.isValid) {
        errors.push(...dateRangeValidation.errors);
      }

      // Validate notice period
      const noticeValidation = validateNoticePeriod(
        params.startDate,
        this.rules.minNoticeDays
      );
      if (!noticeValidation.isValid) {
        errors.push(...noticeValidation.errors);
      }

      // Check for overlapping requests
      const hasOverlap = await this.checkOverlappingRequests(
        params.userId,
        params.startDate,
        params.endDate
      );
      if (hasOverlap) {
        errors.push({
          code: 'OVERLAPPING_REQUEST',
          message: 'You have an overlapping time off request for these dates'
        });
      }

      // Check request limits
      const requestCount = await this.getRequestCount(
        params.userId,
        params.startDate.getFullYear()
      );
      if (requestCount >= this.rules.maxRequestsPerYear) {
        errors.push({
          code: 'REQUEST_LIMIT_EXCEEDED',
          message: `You have reached the maximum number of requests (${this.rules.maxRequestsPerYear}) for this year`
        });
      }

      // Check balance
      const workingDays = calculateWorkingDays(params.startDate, params.endDate);
      const hasBalance = await this.checkBalance(
        params.userId,
        params.type,
        workingDays,
        params.startDate.getFullYear()
      );
      if (!hasBalance) {
        errors.push({
          code: 'INSUFFICIENT_BALANCE',
          message: 'You do not have enough days available for this request'
        });
      }

      return {
        isValid: errors.length === 0,
        errors
      };
    } catch (error) {
      throw new DatabaseError('Failed to validate request');
    }
  }

  private async checkOverlappingRequests(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<boolean> {
    try {
      if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
        const overlappingRequest = await this.prisma.timeOffRequest.findFirst({
          where: {
            userId,
            status: 'APPROVED',
            OR: [
              {
                AND: [
                  { startDate: { lte: startDate } },
                  { endDate: { gte: startDate } }
                ]
              },
              {
                AND: [
                  { startDate: { lte: endDate } },
                  { endDate: { gte: endDate } }
                ]
              }
            ]
          }
        });
        return !!overlappingRequest;
      } else if (process.env.NODE_ENV === 'development') {
        const db = (this.prisma as any).$queryRaw;
        if (!db) {
          throw new DatabaseError('Database connection not available');
        }

        const [overlappingRequest] = await db`
          SELECT * FROM TimeOffRequest
          WHERE user_id = ${userId}
            AND status = 'APPROVED'
            AND (
              (start_date <= ${startDate.toISOString()} AND end_date >= ${startDate.toISOString()})
              OR
              (start_date <= ${endDate.toISOString()} AND end_date >= ${endDate.toISOString()})
            )
          LIMIT 1
        `;

        return !!overlappingRequest;
      }
      throw new DatabaseError('Unsupported environment');
    } catch (error) {
      throw new DatabaseError('Failed to check overlapping requests');
    }
  }

  private async getRequestCount(
    userId: string,
    year: number
  ): Promise<number> {
    try {
      if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
        const count = await this.prisma.timeOffRequest.count({
          where: {
            userId,
            startDate: {
              gte: new Date(year, 0, 1),
              lt: new Date(year + 1, 0, 1)
            }
          }
        });
        return count;
      } else if (process.env.NODE_ENV === 'development') {
        const db = (this.prisma as any).$queryRaw;
        if (!db) {
          throw new DatabaseError('Database connection not available');
        }

        const [{ count }] = await db`
          SELECT COUNT(*) as count
          FROM TimeOffRequest
          WHERE user_id = ${userId}
            AND start_date >= ${new Date(year, 0, 1).toISOString()}
            AND start_date < ${new Date(year + 1, 0, 1).toISOString()}
        `;

        return Number(count);
      }
      throw new DatabaseError('Unsupported environment');
    } catch (error) {
      throw new DatabaseError('Failed to get request count');
    }
  }

  private async checkBalance(
    userId: string,
    type: TimeOffType,
    days: number,
    year: number
  ): Promise<boolean> {
    try {
      if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
        const balance = await this.prisma.timeOffBalance.findUnique({
          where: {
            userId_year: {
              userId,
              year
            }
          }
        });

        if (!balance) {
          return false;
        }

        const balanceField = type.toLowerCase() as keyof typeof balance;
        const availableDays = Number(balance[balanceField]);
        return availableDays >= days;
      } else if (process.env.NODE_ENV === 'development') {
        const db = (this.prisma as any).$queryRaw;
        if (!db) {
          throw new DatabaseError('Database connection not available');
        }

        const [balance] = await db`
          SELECT * FROM TimeOffBalance
          WHERE user_id = ${userId}
            AND year = ${year}
          LIMIT 1
        `;

        if (!balance) {
          return false;
        }

        const balanceField = type.toLowerCase();
        const availableDays = Number(balance[balanceField]);
        return availableDays >= days;
      }
      throw new DatabaseError('Unsupported environment');
    } catch (error) {
      throw new DatabaseError('Failed to check balance');
    }
  }
} 