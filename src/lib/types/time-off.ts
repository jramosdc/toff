import { TimeOffType as PrismaTimeOffType, RequestStatus as PrismaRequestStatus } from '@prisma/client';

export type TimeOffType = PrismaTimeOffType;
export type RequestStatus = PrismaRequestStatus;

export interface TimeOffBalance {
  userId: string;
  year: number;
  type: TimeOffType;
  totalDays: number;
  usedDays: number;
  remainingDays: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TimeOffRequest {
  id: string;
  userId: string;
  type: TimeOffType;
  startDate: Date;
  endDate: Date;
  workingDays: number;
  status: RequestStatus;
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  field?: string;
  message: string;
  code?: string;
}

export interface TimeOffValidationRules {
  minNoticeDays: number;
  maxConsecutiveDays: number;
  maxRequestsPerYear: number;
  blackoutDates: Date[];
}

export interface AuditLog {
  id: string;
  userId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  entityType: 'REQUEST' | 'BALANCE';
  entityId: string;
  details: Record<string, any>;
  createdAt: Date;
} 