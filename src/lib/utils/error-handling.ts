// Standardized error handling utilities for consistent API error responses
import { NextResponse } from 'next/server';
import { ApiErrorResponse } from '../types/api-interfaces';

// Standard error codes
export const ERROR_CODES = {
  // Authentication & Authorization
  UNAUTHORIZED: 'UNAUTHORIZED',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  
  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  
  // Business Logic
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  DUPLICATE_REQUEST: 'DUPLICATE_REQUEST',
  OVERLAPPING_REQUEST: 'OVERLAPPING_REQUEST',
  REQUEST_NOT_FOUND: 'REQUEST_NOT_FOUND',
  
  // Database
  DATABASE_ERROR: 'DATABASE_ERROR',
  CONNECTION_ERROR: 'CONNECTION_ERROR',
  CONSTRAINT_VIOLATION: 'CONSTRAINT_VIOLATION',
  
  // General
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  RATE_LIMITED: 'RATE_LIMITED',
} as const;

// Error response factory functions
export function createErrorResponse(
  message: string,
  code?: string,
  status: number = 500,
  details?: Record<string, any>
): NextResponse<ApiErrorResponse> {
  const errorResponse: ApiErrorResponse = {
    error: message,
    code,
    details: process.env.NODE_ENV === 'development' ? details : undefined,
  };
  
  return NextResponse.json(errorResponse, { status });
}

// Predefined error responses for common scenarios
export const ErrorResponses = {
  // 401 Unauthorized
  unauthorized: (message = 'Authentication required') =>
    createErrorResponse(message, ERROR_CODES.UNAUTHORIZED, 401),
  
  // 403 Forbidden
  forbidden: (message = 'Insufficient permissions') =>
    createErrorResponse(message, ERROR_CODES.INSUFFICIENT_PERMISSIONS, 403),
  
  adminRequired: () =>
    createErrorResponse('Admin access required', ERROR_CODES.INSUFFICIENT_PERMISSIONS, 403),
  
  // 400 Bad Request
  validation: (message: string, details?: Record<string, any>) =>
    createErrorResponse(message, ERROR_CODES.VALIDATION_ERROR, 400, details),
  
  invalidInput: (field: string, reason?: string) =>
    createErrorResponse(
      `Invalid ${field}${reason ? `: ${reason}` : ''}`,
      ERROR_CODES.INVALID_INPUT,
      400,
      { field, reason }
    ),
  
  missingField: (field: string) =>
    createErrorResponse(
      `Missing required field: ${field}`,
      ERROR_CODES.MISSING_REQUIRED_FIELD,
      400,
      { field }
    ),
  
  // 404 Not Found
  notFound: (resource: string, id?: string) =>
    createErrorResponse(
      `${resource} not found${id ? ` with ID: ${id}` : ''}`,
      ERROR_CODES.REQUEST_NOT_FOUND,
      404,
      { resource, id }
    ),
  
  // 409 Conflict
  duplicate: (resource: string, details?: Record<string, any>) =>
    createErrorResponse(
      `${resource} already exists`,
      ERROR_CODES.DUPLICATE_REQUEST,
      409,
      details
    ),
  
  overlapping: (startDate: string, endDate: string) =>
    createErrorResponse(
      `Request overlaps with existing approved request (${startDate} - ${endDate})`,
      ERROR_CODES.OVERLAPPING_REQUEST,
      409,
      { startDate, endDate }
    ),
  
  insufficientBalance: (type: string, required: number, available: number) =>
    createErrorResponse(
      `Insufficient ${type} balance. Required: ${required}, Available: ${available}`,
      ERROR_CODES.INSUFFICIENT_BALANCE,
      409,
      { type, required, available }
    ),
  
  // 500 Internal Server Error
  database: (operation: string, error?: unknown) =>
    createErrorResponse(
      `Database error during ${operation}`,
      ERROR_CODES.DATABASE_ERROR,
      500,
      { operation, error: process.env.NODE_ENV === 'development' ? String(error) : undefined }
    ),
  
  internal: (message = 'Internal server error', error?: unknown) =>
    createErrorResponse(
      message,
      ERROR_CODES.INTERNAL_ERROR,
      500,
      { error: process.env.NODE_ENV === 'development' ? String(error) : undefined }
    ),
  
  // 503 Service Unavailable
  serviceUnavailable: (service: string) =>
    createErrorResponse(
      `${service} is currently unavailable`,
      ERROR_CODES.SERVICE_UNAVAILABLE,
      503
    ),
} as const;

// Success response factory
export function createSuccessResponse<T>(
  data: T,
  message?: string,
  status: number = 200
): NextResponse {
  const response = message ? { data, message } : data;
  return NextResponse.json(response, { status });
}

// Error handling wrapper for API routes
export function withErrorHandling<T extends any[], R>(
  handler: (...args: T) => Promise<NextResponse<R>>
) {
  return async (...args: T): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      console.error('Unhandled API error:', error);
      
      // Handle specific error types
      if (error instanceof ValidationError) {
        return ErrorResponses.validation(error.message, { field: error.field });
      }
      
      if (error instanceof DatabaseError) {
        return ErrorResponses.database(error.operation, error);
      }
      
      if (error instanceof AuthenticationError) {
        return ErrorResponses.unauthorized(error.message);
      }
      
      if (error instanceof AuthorizationError) {
        return ErrorResponses.forbidden(error.message);
      }
      
      // Default to internal server error
      return ErrorResponses.internal('An unexpected error occurred', error);
    }
  };
}

// Custom error classes for better error categorization
export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class DatabaseError extends Error {
  constructor(message: string, public operation: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class AuthenticationError extends Error {
  constructor(message: string = 'Authentication required') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  constructor(message: string = 'Insufficient permissions') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class BusinessLogicError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'BusinessLogicError';
  }
}

// Session validation helper
export async function validateSession(session: any, requireAdmin = false) {
  if (!session?.user?.id) {
    throw new AuthenticationError();
  }
  
  if (requireAdmin && session.user.role !== 'ADMIN') {
    throw new AuthorizationError('Admin access required');
  }
  
  return session;
}

// Database operation wrapper
export async function withDatabaseOperation<T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error(`Database operation failed: ${operation}`, error);
    throw new DatabaseError(`Failed to ${operation}`, operation);
  }
} 