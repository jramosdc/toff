export class TimeOffError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number = 400
  ) {
    super(message);
    this.name = 'TimeOffError';
  }
}

export class InsufficientBalanceError extends TimeOffError {
  constructor(type: string, required: number, available: number) {
    super(
      `Insufficient ${type.toLowerCase()} days. Required: ${required}, Available: ${available}`,
      'INSUFFICIENT_BALANCE',
      400
    );
    this.name = 'InsufficientBalanceError';
  }
}

export class ValidationError extends TimeOffError {
  constructor(message: string, field?: string) {
    super(
      message,
      'VALIDATION_ERROR',
      400
    );
    this.name = 'ValidationError';
    if (field) {
      this.field = field;
    }
  }
  field?: string;
}

export class OverlappingRequestError extends TimeOffError {
  constructor(startDate: Date, endDate: Date) {
    super(
      `Time off request overlaps with existing approved request (${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()})`,
      'OVERLAPPING_REQUEST',
      400
    );
    this.name = 'OverlappingRequestError';
  }
}

export class BlackoutDateError extends TimeOffError {
  constructor(date: Date) {
    super(
      `Time off request includes blackout date: ${date.toLocaleDateString()}`,
      'BLACKOUT_DATE',
      400
    );
    this.name = 'BlackoutDateError';
  }
}

export class NoticePeriodError extends TimeOffError {
  constructor(requiredDays: number) {
    super(
      `Time off request must be submitted at least ${requiredDays} days in advance`,
      'INSUFFICIENT_NOTICE',
      400
    );
    this.name = 'NoticePeriodError';
  }
}

export class ConsecutiveDaysError extends TimeOffError {
  constructor(maxDays: number) {
    super(
      `Time off request exceeds maximum consecutive days (${maxDays})`,
      'MAX_CONSECUTIVE_DAYS',
      400
    );
    this.name = 'ConsecutiveDaysError';
  }
}

export class RequestLimitError extends TimeOffError {
  constructor(maxRequests: number) {
    super(
      `Maximum number of time off requests (${maxRequests}) exceeded for this year`,
      'REQUEST_LIMIT_EXCEEDED',
      400
    );
    this.name = 'RequestLimitError';
  }
}

export class UnauthorizedError extends TimeOffError {
  constructor(message: string = 'Unauthorized access') {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'UnauthorizedError';
  }
}

export class DatabaseError extends TimeOffError {
  constructor(message: string = 'Database operation failed') {
    super(message, 'DATABASE_ERROR', 500);
    this.name = 'DatabaseError';
  }
} 