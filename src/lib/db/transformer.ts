import { TimeOffRequest, TimeOffBalance, AuditLog } from '../types/time-off';
import { TimeOffType, RequestStatus } from '@prisma/client';

export function transformTimeOffRequest(prismaRequest: any): TimeOffRequest {
  return {
    id: prismaRequest.id,
    userId: prismaRequest.userId || prismaRequest.user_id,
    type: prismaRequest.type as TimeOffType,
    startDate: new Date(prismaRequest.startDate || prismaRequest.start_date),
    endDate: new Date(prismaRequest.endDate || prismaRequest.end_date),
    workingDays: Number(prismaRequest.workingDays || prismaRequest.working_days),
    status: prismaRequest.status as RequestStatus,
    reason: prismaRequest.reason,
    createdAt: new Date(prismaRequest.createdAt || prismaRequest.created_at),
    updatedAt: new Date(prismaRequest.updatedAt || prismaRequest.updated_at)
  };
}

export function transformTimeOffBalance(prismaBalance: any): TimeOffBalance {
  return {
    userId: prismaBalance.userId || prismaBalance.user_id,
    year: Number(prismaBalance.year),
    type: prismaBalance.type as TimeOffType,
    totalDays: Number(prismaBalance.totalDays || prismaBalance.total_days),
    usedDays: Number(prismaBalance.usedDays || prismaBalance.used_days),
    remainingDays: Number(prismaBalance.remainingDays || prismaBalance.remaining_days),
    createdAt: new Date(prismaBalance.createdAt || prismaBalance.created_at),
    updatedAt: new Date(prismaBalance.updatedAt || prismaBalance.updated_at)
  };
}

export function transformAuditLog(prismaLog: any): AuditLog {
  return {
    id: prismaLog.id,
    userId: prismaLog.userId || prismaLog.user_id,
    action: prismaLog.action as AuditLog['action'],
    entityType: prismaLog.entityType || prismaLog.entity_type as AuditLog['entityType'],
    entityId: prismaLog.entityId || prismaLog.entity_id,
    details: typeof prismaLog.details === 'string' 
      ? JSON.parse(prismaLog.details) 
      : prismaLog.details,
    createdAt: new Date(prismaLog.createdAt || prismaLog.created_at)
  };
}

export function createTimeOffRequestInput(
  userId: string,
  type: TimeOffType,
  startDate: Date,
  endDate: Date,
  workingDays: number,
  reason?: string | null
) {
  return {
    userId,
    type,
    startDate,
    endDate,
    workingDays,
    status: 'PENDING' as RequestStatus,
    reason
  };
}

export function createTimeOffBalanceInput(
  userId: string,
  year: number,
  type: TimeOffType,
  totalDays: number,
  usedDays: number = 0
) {
  return {
    userId,
    year,
    type,
    totalDays,
    usedDays,
    remainingDays: totalDays - usedDays
  };
}

export function createAuditLogInput(
  userId: string,
  action: AuditLog['action'],
  entityType: AuditLog['entityType'],
  entityId: string,
  details: Record<string, any>
) {
  return {
    userId,
    action,
    entityType,
    entityId,
    details
  };
} 