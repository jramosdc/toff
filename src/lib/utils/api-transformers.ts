// API transformation utilities for consistent naming convention handling
// Safely converts between snake_case database fields and camelCase API interfaces

import {
  StandardUser,
  StandardTimeOffRequest,
  StandardOvertimeRequest,
  StandardTimeOffBalance
} from '../types/api-interfaces';

// Database entity types (snake_case as they come from database)
export interface DatabaseUser {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at?: string;
  updated_at?: string;
}

export interface DatabaseTimeOffRequest {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  type: string;
  status: string;
  reason?: string;
  working_days?: number;
  user_name?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DatabaseOvertimeRequest {
  id: string;
  user_id: string;
  hours: number;
  request_date: string;
  month: number;
  year: number;
  status: string;
  notes?: string;
  user_name?: string;
  user_email?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DatabaseTimeOffBalance {
  id: string;
  user_id: string;
  vacation_days: number;
  sick_days: number;
  paid_leave: number;
  personal_days: number;
  year: number;
  created_at?: string;
  updated_at?: string;
}

// Transformation functions: Database -> API (snake_case -> camelCase)
export function transformUserToApi(dbUser: DatabaseUser): StandardUser {
  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role as 'ADMIN' | 'EMPLOYEE',
    createdAt: dbUser.created_at ? new Date(dbUser.created_at) : undefined,
    updatedAt: dbUser.updated_at ? new Date(dbUser.updated_at) : undefined,
  };
}

export function transformTimeOffRequestToApi(dbRequest: DatabaseTimeOffRequest): StandardTimeOffRequest {
  return {
    id: dbRequest.id,
    userId: dbRequest.user_id,
    startDate: dbRequest.start_date,
    endDate: dbRequest.end_date,
    type: dbRequest.type as 'VACATION' | 'SICK' | 'PAID_LEAVE' | 'PERSONAL',
    status: dbRequest.status as 'PENDING' | 'APPROVED' | 'REJECTED',
    reason: dbRequest.reason,
    workingDays: dbRequest.working_days,
    userName: dbRequest.user_name,
    createdAt: dbRequest.created_at,
    updatedAt: dbRequest.updated_at,
  };
}

export function transformOvertimeRequestToApi(dbRequest: DatabaseOvertimeRequest): StandardOvertimeRequest {
  return {
    id: dbRequest.id,
    userId: dbRequest.user_id,
    hours: dbRequest.hours,
    requestDate: dbRequest.request_date,
    month: dbRequest.month,
    year: dbRequest.year,
    status: dbRequest.status as 'PENDING' | 'APPROVED' | 'REJECTED',
    notes: dbRequest.notes,
    userName: dbRequest.user_name,
    userEmail: dbRequest.user_email,
    createdAt: dbRequest.created_at,
    updatedAt: dbRequest.updated_at,
  };
}

export function transformTimeOffBalanceToApi(dbBalance: DatabaseTimeOffBalance): StandardTimeOffBalance {
  return {
    id: dbBalance.id,
    userId: dbBalance.user_id,
    year: dbBalance.year,
    vacationDays: dbBalance.vacation_days,
    sickDays: dbBalance.sick_days,
    paidLeave: dbBalance.paid_leave,
    personalDays: dbBalance.personal_days,
    createdAt: dbBalance.created_at,
    updatedAt: dbBalance.updated_at,
  };
}

// Transformation functions: API -> Database (camelCase -> snake_case)
export function transformUserToDatabase(apiUser: StandardUser): DatabaseUser {
  return {
    id: apiUser.id,
    email: apiUser.email,
    name: apiUser.name,
    role: apiUser.role,
    created_at: apiUser.createdAt?.toISOString(),
    updated_at: apiUser.updatedAt?.toISOString(),
  };
}

export function transformTimeOffRequestToDatabase(apiRequest: StandardTimeOffRequest): DatabaseTimeOffRequest {
  return {
    id: apiRequest.id,
    user_id: apiRequest.userId,
    start_date: apiRequest.startDate,
    end_date: apiRequest.endDate,
    type: apiRequest.type,
    status: apiRequest.status,
    reason: apiRequest.reason,
    working_days: apiRequest.workingDays,
    user_name: apiRequest.userName,
    created_at: apiRequest.createdAt,
    updated_at: apiRequest.updatedAt,
  };
}

export function transformOvertimeRequestToDatabase(apiRequest: StandardOvertimeRequest): DatabaseOvertimeRequest {
  return {
    id: apiRequest.id,
    user_id: apiRequest.userId,
    hours: apiRequest.hours,
    request_date: apiRequest.requestDate,
    month: apiRequest.month,
    year: apiRequest.year,
    status: apiRequest.status,
    notes: apiRequest.notes,
    user_name: apiRequest.userName,
    user_email: apiRequest.userEmail,
    created_at: apiRequest.createdAt,
    updated_at: apiRequest.updatedAt,
  };
}

export function transformTimeOffBalanceToDatabase(apiBalance: StandardTimeOffBalance): DatabaseTimeOffBalance {
  return {
    id: apiBalance.id,
    user_id: apiBalance.userId,
    year: apiBalance.year,
    vacation_days: apiBalance.vacationDays,
    sick_days: apiBalance.sickDays,
    paid_leave: apiBalance.paidLeave,
    personal_days: apiBalance.personalDays,
    created_at: apiBalance.createdAt,
    updated_at: apiBalance.updatedAt,
  };
}

// Batch transformation utilities
export function transformUsersToApi(dbUsers: DatabaseUser[]): StandardUser[] {
  return dbUsers.map(transformUserToApi);
}

export function transformTimeOffRequestsToApi(dbRequests: DatabaseTimeOffRequest[]): StandardTimeOffRequest[] {
  return dbRequests.map(transformTimeOffRequestToApi);
}

export function transformOvertimeRequestsToApi(dbRequests: DatabaseOvertimeRequest[]): StandardOvertimeRequest[] {
  return dbRequests.map(transformOvertimeRequestToApi);
}

// Utility functions for field name conversion
export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// Generic object transformation utilities
export function transformObjectToSnakeCase<T extends Record<string, any>>(obj: T): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[camelToSnake(key)] = value;
  }
  return result;
}

export function transformObjectToCamelCase<T extends Record<string, any>>(obj: T): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[snakeToCamel(key)] = value;
  }
  return result;
}

// Safe transformation with error handling
export function safeTransformToApi<T, U>(
  data: T | T[],
  transformer: (item: T) => U
): U | U[] | null {
  try {
    if (Array.isArray(data)) {
      return data.map(transformer);
    } else if (data) {
      return transformer(data);
    }
    return null;
  } catch (error) {
    console.error('Error during API transformation:', error);
    return null;
  }
} 