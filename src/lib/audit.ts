import { PrismaClient } from '@prisma/client';
import { AuditLog } from './types/time-off';
import { DatabaseAdapter, createDatabaseAdapter } from './db/adapter';
import { transformAuditLog, createAuditLogInput } from './db/transformer';
import { v4 as uuidv4 } from 'uuid';

export class AuditLogger {
  private adapter: DatabaseAdapter;

  constructor(private prisma: PrismaClient) {
    this.adapter = createDatabaseAdapter(prisma);
  }

  async log(
    userId: string,
    action: AuditLog['action'],
    entityType: AuditLog['entityType'],
    entityId: string,
    details: Record<string, any>
  ): Promise<void> {
    const logInput = createAuditLogInput(userId, action, entityType, entityId, details);

    try {
      if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
        await this.prisma.auditLog.create({
          data: {
            id: uuidv4(),
            ...logInput
          }
        });
      } else if (process.env.NODE_ENV === 'development') {
        await this.adapter.execute(`
          INSERT INTO audit_logs (
            id, user_id, action, entity_type, entity_id, details, created_at
          ) VALUES (
            ${uuidv4()},
            ${logInput.userId},
            ${logInput.action},
            ${logInput.entityType},
            ${logInput.entityId},
            ${JSON.stringify(logInput.details)},
            ${new Date().toISOString()}
          )
        `);
      }
    } catch (error) {
      console.error('Failed to create audit log:', error);
      // Don't throw the error as audit logging should not break the main flow
    }
  }

  async getLogs(
    filters: {
      userId?: string;
      entityType?: AuditLog['entityType'];
      entityId?: string;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<AuditLog[]> {
    try {
      if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
        const logs = await this.prisma.auditLog.findMany({
          where: {
            ...(filters.userId && { userId: filters.userId }),
            ...(filters.entityType && { entityType: filters.entityType }),
            ...(filters.entityId && { entityId: filters.entityId }),
            ...(filters.startDate && { createdAt: { gte: filters.startDate } }),
            ...(filters.endDate && { createdAt: { lte: filters.endDate } })
          },
          orderBy: {
            createdAt: 'desc'
          }
        });

        return logs.map(transformAuditLog);
      } else if (process.env.NODE_ENV === 'development') {
        const conditions = [];
        const params = [];

        if (filters.userId) {
          conditions.push('user_id = ?');
          params.push(filters.userId);
        }
        if (filters.entityType) {
          conditions.push('entity_type = ?');
          params.push(filters.entityType);
        }
        if (filters.entityId) {
          conditions.push('entity_id = ?');
          params.push(filters.entityId);
        }
        if (filters.startDate) {
          conditions.push('created_at >= ?');
          params.push(filters.startDate.toISOString());
        }
        if (filters.endDate) {
          conditions.push('created_at <= ?');
          params.push(filters.endDate.toISOString());
        }

        const whereClause = conditions.length > 0
          ? `WHERE ${conditions.join(' AND ')}`
          : '';

        const logs = await this.adapter.query(`
          SELECT * FROM audit_logs
          ${whereClause}
          ORDER BY created_at DESC
        `, params);

        return logs.map(transformAuditLog);
      }
      return [];
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
      return [];
    }
  }
} 