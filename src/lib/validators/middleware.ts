import { NextRequest, NextResponse } from 'next/server';
import { z, ZodSchema } from 'zod';

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public code: string = 'VALIDATION_ERROR',
    public statusCode: number = 400,
    public details?: ValidationError[]
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function validateRequest<T>(
  schema: ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: ValidationError[] } {
  try {
    const validatedData = schema.parse(data);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors: ValidationError[] = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
        code: 'VALIDATION_ERROR'
      }));
      return { success: false, errors };
    }
    return { success: false, errors: [{ field: 'unknown', message: 'Unknown validation error', code: 'UNKNOWN_ERROR' }] };
  }
}

export function createValidationMiddleware<T>(schema: ZodSchema<T>) {
  return async (req: NextRequest) => {
    try {
      const body = await req.json();
      const validation = validateRequest(schema, body);
      
      if (!validation.success) {
        return NextResponse.json(
          {
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: validation.errors
          },
          { status: 400 }
        );
      }
      
      return validation.data;
    } catch (error) {
      return NextResponse.json(
        {
          error: 'Invalid JSON in request body',
          code: 'INVALID_JSON'
        },
        { status: 400 }
      );
    }
  };
}

export function validateQueryParams<T>(schema: ZodSchema<T>, searchParams: URLSearchParams) {
  const params = Object.fromEntries(searchParams.entries());
  return validateRequest(schema, params);
}

export function validatePathParams<T>(schema: ZodSchema<T>, params: Record<string, string | string[]>) {
  return validateRequest(schema, params);
}

// Helper function to format validation errors for API responses
export function formatValidationErrors(errors: ValidationError[]) {
  return {
    error: 'Validation failed',
    code: 'VALIDATION_ERROR',
    details: errors.reduce((acc, err) => {
      acc[err.field] = err.message;
      return acc;
    }, {} as Record<string, string>)
  };
}

// Helper function to create a standardized error response
export function createErrorResponse(
  message: string,
  code: string = 'ERROR',
  statusCode: number = 400,
  details?: any
) {
  return NextResponse.json(
    {
      error: message,
      code,
      ...(details && { details })
    },
    { status: statusCode }
  );
}
