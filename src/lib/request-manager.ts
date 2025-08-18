import { PrismaClient } from '@prisma/client';
import { TimeOffRequest, TimeOffType, RequestStatus } from './types/time-off';
import { TransactionManager } from './db/transaction';
import { AuditLogger } from './audit';
import { BalanceManager } from './balance-manager';
import { TimeOffValidator } from './validators/time-off';
import { DatabaseError, ValidationError } from './errors/time-off';
import { calculateWorkingDays } from './date-utils';

export class RequestManager {
  constructor(
    private prisma: PrismaClient,
    private transactionManager: TransactionManager,
    private auditLogger: AuditLogger,
    private balanceManager: BalanceManager,
    private validator: TimeOffValidator
  ) {}

  async createRequest(
    userId: string,
    type: TimeOffType,
    startDate: Date,
    endDate: Date,
    reason?: string
  ): Promise<TimeOffRequest> {
    // Validate the request
    const validationResult = await this.validator.validateRequest({
      userId,
      type,
      startDate,
      endDate,
      reason
    });

    if (!validationResult.isValid) {
      throw new ValidationError(validationResult.errors[0].message);
    }

    const workingDays = calculateWorkingDays(startDate, endDate);

    return this.transactionManager.execute(async (tx) => {
      try {
        if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
          const request = await tx.timeOffRequest.create({
            data: {
              userId,
              type,
              startDate,
              endDate,
              workingDays,
              status: 'PENDING',
              reason
            }
          });

          await this.auditLogger.log(userId, 'CREATE', 'REQUEST', request.id, {
            type,
            startDate,
            endDate,
            workingDays,
            reason
          });

          return {
            id: request.id,
            userId: request.userId,
            type: request.type,
            startDate: request.startDate,
            endDate: request.endDate,
            workingDays: request.workingDays,
            status: request.status,
            reason: request.reason,
            createdAt: request.createdAt,
            updatedAt: request.updatedAt
          };
        } else if (process.env.NODE_ENV === 'development') {
          const db = (tx as any).$queryRaw;
          if (!db) {
            throw new DatabaseError('Database connection not available');
          }

          const [request] = await db`
            INSERT INTO TimeOffRequest (
              id, user_id, type, start_date, end_date, working_days, status, reason, created_at, updated_at
            ) VALUES (
              ${crypto.randomUUID()},
              ${userId},
              ${type},
              ${startDate.toISOString()},
              ${endDate.toISOString()},
              ${workingDays},
              'PENDING',
              ${reason || null},
              ${new Date().toISOString()},
              ${new Date().toISOString()}
            )
            RETURNING *
          `;

          await this.auditLogger.log(userId, 'CREATE', 'REQUEST', request.id, {
            type,
            startDate,
            endDate,
            workingDays,
            reason
          });

          return {
            id: request.id,
            userId: request.user_id,
            type: request.type as TimeOffType,
            startDate: new Date(request.start_date),
            endDate: new Date(request.end_date),
            workingDays: Number(request.working_days),
            status: request.status as RequestStatus,
            reason: request.reason,
            createdAt: new Date(request.created_at),
            updatedAt: new Date(request.updated_at)
          };
        }
        throw new DatabaseError('Unsupported environment');
      } catch (error) {
        throw new DatabaseError('Failed to create request');
      }
    });
  }

  async approveRequest(
    requestId: string,
    approverId: string,
    year: number
  ): Promise<TimeOffRequest> {
    return this.transactionManager.execute(async (tx) => {
      try {
        if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
          const request = await tx.timeOffRequest.findUnique({
            where: { id: requestId }
          });

          if (!request) {
            throw new DatabaseError('Request not found');
          }

          if (request.status !== 'PENDING') {
            throw new ValidationError('Request is not pending');
          }

          // Update request status
          const updatedRequest = await tx.timeOffRequest.update({
            where: { id: requestId },
            data: { status: 'APPROVED' }
          });

          // Deduct balance
          await this.balanceManager.deductBalance(
            request.userId,
            year,
            request.type,
            request.workingDays,
            `Approved time off request ${requestId}`
          );

          await this.auditLogger.log(approverId, 'UPDATE', 'REQUEST', requestId, {
            previousStatus: request.status,
            newStatus: 'APPROVED',
            approverId
          });

          return {
            id: updatedRequest.id,
            userId: updatedRequest.userId,
            type: updatedRequest.type,
            startDate: updatedRequest.startDate,
            endDate: updatedRequest.endDate,
            workingDays: updatedRequest.workingDays,
            status: updatedRequest.status,
            reason: updatedRequest.reason,
            createdAt: updatedRequest.createdAt,
            updatedAt: updatedRequest.updatedAt
          };
        } else if (process.env.NODE_ENV === 'development') {
          const db = (tx as any).$queryRaw;
          if (!db) {
            throw new DatabaseError('Database connection not available');
          }

          const [request] = await db`
            SELECT * FROM TimeOffRequest
            WHERE id = ${requestId}
            LIMIT 1
          `;

          if (!request) {
            throw new DatabaseError('Request not found');
          }

          if (request.status !== 'PENDING') {
            throw new ValidationError('Request is not pending');
          }

          // Update request status
          const [updatedRequest] = await db`
            UPDATE TimeOffRequest
            SET status = 'APPROVED', updated_at = ${new Date().toISOString()}
            WHERE id = ${requestId}
            RETURNING *
          `;

          // Deduct balance
          await this.balanceManager.deductBalance(
            request.user_id,
            year,
            request.type as TimeOffType,
            Number(request.working_days),
            `Approved time off request ${requestId}`
          );

          await this.auditLogger.log(approverId, 'UPDATE', 'REQUEST', requestId, {
            previousStatus: request.status,
            newStatus: 'APPROVED',
            approverId
          });

          return {
            id: updatedRequest.id,
            userId: updatedRequest.user_id,
            type: updatedRequest.type as TimeOffType,
            startDate: new Date(updatedRequest.start_date),
            endDate: new Date(updatedRequest.end_date),
            workingDays: Number(updatedRequest.working_days),
            status: updatedRequest.status as RequestStatus,
            reason: updatedRequest.reason,
            createdAt: new Date(updatedRequest.created_at),
            updatedAt: new Date(updatedRequest.updated_at)
          };
        }
        throw new DatabaseError('Unsupported environment');
      } catch (error) {
        if (error instanceof ValidationError) {
          throw error;
        }
        throw new DatabaseError('Failed to approve request');
      }
    });
  }

  async rejectRequest(
    requestId: string,
    approverId: string,
    reason?: string
  ): Promise<TimeOffRequest> {
    return this.transactionManager.execute(async (tx) => {
      try {
        if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
          const request = await tx.timeOffRequest.findUnique({
            where: { id: requestId }
          });

          if (!request) {
            throw new DatabaseError('Request not found');
          }

          if (request.status !== 'PENDING') {
            throw new ValidationError('Request is not pending');
          }

          const updatedRequest = await tx.timeOffRequest.update({
            where: { id: requestId },
            data: {
              status: 'REJECTED',
              reason: reason || request.reason
            }
          });

          await this.auditLogger.log(approverId, 'UPDATE', 'REQUEST', requestId, {
            previousStatus: request.status,
            newStatus: 'REJECTED',
            reason,
            approverId
          });

          return {
            id: updatedRequest.id,
            userId: updatedRequest.userId,
            type: updatedRequest.type,
            startDate: updatedRequest.startDate,
            endDate: updatedRequest.endDate,
            workingDays: updatedRequest.workingDays,
            status: updatedRequest.status,
            reason: updatedRequest.reason,
            createdAt: updatedRequest.createdAt,
            updatedAt: updatedRequest.updatedAt
          };
        } else if (process.env.NODE_ENV === 'development') {
          const db = (tx as any).$queryRaw;
          if (!db) {
            throw new DatabaseError('Database connection not available');
          }

          const [request] = await db`
            SELECT * FROM TimeOffRequest
            WHERE id = ${requestId}
            LIMIT 1
          `;

          if (!request) {
            throw new DatabaseError('Request not found');
          }

          if (request.status !== 'PENDING') {
            throw new ValidationError('Request is not pending');
          }

          const [updatedRequest] = await db`
            UPDATE TimeOffRequest
            SET status = 'REJECTED',
                reason = ${reason || request.reason},
                updated_at = ${new Date().toISOString()}
            WHERE id = ${requestId}
            RETURNING *
          `;

          await this.auditLogger.log(approverId, 'UPDATE', 'REQUEST', requestId, {
            previousStatus: request.status,
            newStatus: 'REJECTED',
            reason,
            approverId
          });

          return {
            id: updatedRequest.id,
            userId: updatedRequest.user_id,
            type: updatedRequest.type as TimeOffType,
            startDate: new Date(updatedRequest.start_date),
            endDate: new Date(updatedRequest.end_date),
            workingDays: Number(updatedRequest.working_days),
            status: updatedRequest.status as RequestStatus,
            reason: updatedRequest.reason,
            createdAt: new Date(updatedRequest.created_at),
            updatedAt: new Date(updatedRequest.updated_at)
          };
        }
        throw new DatabaseError('Unsupported environment');
      } catch (error) {
        if (error instanceof ValidationError) {
          throw error;
        }
        throw new DatabaseError('Failed to reject request');
      }
    });
  }

  async deleteRequest(
    requestId: string,
    userId: string,
    year: number
  ): Promise<void> {
    return this.transactionManager.execute(async (tx) => {
      try {
        if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
          const request = await tx.timeOffRequest.findUnique({
            where: { id: requestId }
          });

          if (!request) {
            throw new DatabaseError('Request not found');
          }

          if (request.userId !== userId) {
            throw new ValidationError('Not authorized to delete this request');
          }

          // If request was approved, restore the balance
          if (request.status === 'APPROVED') {
            await this.balanceManager.restoreBalance(
              request.userId,
              year,
              request.type,
              request.workingDays,
              `Deleted time off request ${requestId}`
            );
          }

          await tx.timeOffRequest.delete({
            where: { id: requestId }
          });

          await this.auditLogger.log(userId, 'DELETE', 'REQUEST', requestId, {
            type: request.type,
            startDate: request.startDate,
            endDate: request.endDate,
            workingDays: request.workingDays,
            status: request.status
          });
        } else if (process.env.NODE_ENV === 'development') {
          const db = (tx as any).$queryRaw;
          if (!db) {
            throw new DatabaseError('Database connection not available');
          }

          const [request] = await db`
            SELECT * FROM TimeOffRequest
            WHERE id = ${requestId}
            LIMIT 1
          `;

          if (!request) {
            throw new DatabaseError('Request not found');
          }

          if (request.user_id !== userId) {
            throw new ValidationError('Not authorized to delete this request');
          }

          // If request was approved, restore the balance
          if (request.status === 'APPROVED') {
            await this.balanceManager.restoreBalance(
              request.user_id,
              year,
              request.type as TimeOffType,
              Number(request.working_days),
              `Deleted time off request ${requestId}`
            );
          }

          await db`
            DELETE FROM TimeOffRequest
            WHERE id = ${requestId}
          `;

          await this.auditLogger.log(userId, 'DELETE', 'REQUEST', requestId, {
            type: request.type,
            startDate: new Date(request.start_date),
            endDate: new Date(request.end_date),
            workingDays: Number(request.working_days),
            status: request.status
          });
        } else {
          throw new DatabaseError('Unsupported environment');
        }
      } catch (error) {
        if (error instanceof ValidationError) {
          throw error;
        }
        throw new DatabaseError('Failed to delete request');
      }
    });
  }
} 