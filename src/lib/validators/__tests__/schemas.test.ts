import { describe, it, expect } from 'vitest';
import {
  CreateTimeOffRequestSchema,
  CreateTimeOffBalanceSchema,
  CreateOvertimeRequestSchema,
  TimeOffRequestFilterSchema
} from '../schemas';

describe('Time Off Request Schema Validation', () => {
  it('should validate a valid time off request', () => {
    const validRequest = {
      userId: '123e4567-e89b-12d3-a456-426614174000',
      startDate: '2025-01-20T00:00:00.000Z',
      endDate: '2025-01-24T00:00:00.000Z',
      type: 'VACATION',
      reason: 'Annual family vacation'
    };

    const result = CreateTimeOffRequestSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
  });

  it('should validate request without user ID (optional)', () => {
    const validRequest = {
      startDate: '2025-01-20T00:00:00.000Z',
      endDate: '2025-01-24T00:00:00.000Z',
      type: 'VACATION',
      reason: 'Annual family vacation'
    };

    const result = CreateTimeOffRequestSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
  });

  it('should reject invalid user ID', () => {
    const invalidRequest = {
      userId: 'invalid-uuid',
      startDate: '2025-01-20T00:00:00.000Z',
      endDate: '2025-01-24T00:00:00.000Z',
      type: 'VACATION',
      reason: 'Annual family vacation'
    };

    const result = CreateTimeOffRequestSchema.safeParse(invalidRequest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('Invalid uuid');
    }
  });

  it('should reject invalid start date format', () => {
    const invalidRequest = {
      userId: '123e4567-e89b-12d3-a456-426614174000',
      startDate: 'invalid-date',
      endDate: '2025-01-24T00:00:00.000Z',
      type: 'VACATION',
      reason: 'Annual family vacation'
    };

    const result = CreateTimeOffRequestSchema.safeParse(invalidRequest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('Invalid date');
    }
  });

  it('should reject invalid end date format', () => {
    const invalidRequest = {
      userId: '123e4567-e89b-12d3-a456-426614174000',
      startDate: '2025-01-20T00:00:00.000Z',
      endDate: 'invalid-date',
      type: 'VACATION',
      reason: 'Annual family vacation'
    };

    const result = CreateTimeOffRequestSchema.safeParse(invalidRequest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('Invalid date');
    }
  });

  it('should reject invalid time off type', () => {
    const invalidRequest = {
      userId: '123e4567-e89b-12d3-a456-426614174000',
      startDate: '2025-01-20T00:00:00.000Z',
      endDate: '2025-01-24T00:00:00.000Z',
      type: 'INVALID_TYPE',
      reason: 'Annual family vacation'
    };

    const result = CreateTimeOffRequestSchema.safeParse(invalidRequest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('Invalid enum value');
    }
  });

  it('should reject start date after end date', () => {
    const invalidRequest = {
      userId: '123e4567-e89b-12d3-a456-426614174000',
      startDate: '2025-01-24T00:00:00.000Z',
      endDate: '2025-01-20T00:00:00.000Z',
      type: 'VACATION',
      reason: 'Annual family vacation'
    };

    const result = CreateTimeOffRequestSchema.safeParse(invalidRequest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('Start date must be before or equal to end date');
    }
  });

  it('should allow start date in the past', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 10);
    
    const pastEndDate = new Date();
    pastEndDate.setDate(pastEndDate.getDate() - 5);

    const validRequest = {
      userId: '123e4567-e89b-12d3-a456-426614174000',
      startDate: pastDate.toISOString(),
      endDate: pastEndDate.toISOString(),
      type: 'VACATION',
      reason: 'Past family vacation'
    };

    const result = CreateTimeOffRequestSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
  });

  it('should reject empty reason', () => {
    const invalidRequest = {
      userId: '123e4567-e89b-12d3-a456-426614174000',
      startDate: '2025-01-20T00:00:00.000Z',
      endDate: '2025-01-24T00:00:00.000Z',
      type: 'VACATION',
      reason: ''
    };

    const result = CreateTimeOffRequestSchema.safeParse(invalidRequest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('Reason is required');
    }
  });

  it('should reject reason that is too long', () => {
    const longReason = 'a'.repeat(501);
    const invalidRequest = {
      userId: '123e4567-e89b-12d3-a456-426614174000',
      startDate: '2025-01-20T00:00:00.000Z',
      endDate: '2025-01-24T00:00:00.000Z',
      type: 'VACATION',
      reason: longReason
    };

    const result = CreateTimeOffRequestSchema.safeParse(invalidRequest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('Reason must be less than 500 characters');
    }
  });
});

describe('Time Off Balance Schema Validation', () => {
  it('should validate a valid time off balance', () => {
    const validBalance = {
      userId: '123e4567-e89b-12d3-a456-426614174000',
      year: 2025,
      type: 'VACATION',
      totalDays: 15
    };

    const result = CreateTimeOffBalanceSchema.safeParse(validBalance);
    expect(result.success).toBe(true);
  });

  it('should reject invalid year', () => {
    const invalidBalance = {
      userId: '123e4567-e89b-12d3-a456-426614174000',
      year: 2020, // Too old
      type: 'VACATION',
      totalDays: 15
    };

    const result = CreateTimeOffBalanceSchema.safeParse(invalidBalance);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('Year must be between 2024 and 2030');
    }
  });

  it('should reject negative total days', () => {
    const invalidBalance = {
      userId: '123e4567-e89b-12d3-a456-426614174000',
      year: 2025,
      type: 'VACATION',
      totalDays: -5
    };

    const result = CreateTimeOffBalanceSchema.safeParse(invalidBalance);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('Total days must be between 0 and 365');
    }
  });
});

describe('Overtime Request Schema Validation', () => {
  it('should validate a valid overtime request', () => {
    const validRequest = {
      userId: '123e4567-e89b-12d3-a456-426614174000',
      hours: 8,
      month: 1,
      year: 2025,
      notes: 'Extra work on weekend project'
    };

    const result = CreateOvertimeRequestSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
  });

  it('should reject negative hours', () => {
    const invalidRequest = {
      userId: '123e4567-e89b-12d3-a456-426614174000',
      hours: -2,
      month: 1,
      year: 2025,
      notes: 'Extra work'
    };

    const result = CreateOvertimeRequestSchema.safeParse(invalidRequest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('Hours must be between 0.5 and 24');
    }
  });

  it('should reject hours over 24', () => {
    const invalidRequest = {
      userId: '123e4567-e89b-12d3-a456-426614174000',
      hours: 25,
      month: 1,
      year: 2025,
      notes: 'Extra work'
    };

    const result = CreateOvertimeRequestSchema.safeParse(invalidRequest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('Hours must be between 0.5 and 24');
    }
  });

  it('should reject invalid month', () => {
    const invalidRequest = {
      userId: '123e4567-e89b-12d3-a456-426614174000',
      hours: 8,
      month: 13, // Invalid month
      year: 2025,
      notes: 'Extra work'
    };

    const result = CreateOvertimeRequestSchema.safeParse(invalidRequest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('Month must be between 1 and 12');
    }
  });
});

describe('Time Off Request Filter Schema Validation', () => {
  it('should validate a valid filter', () => {
    const validFilter = {
      userId: '123e4567-e89b-12d3-a456-426614174000',
      status: 'PENDING',
      type: 'VACATION',
      startDate: '2025-01-01T00:00:00.000Z',
      endDate: '2025-12-31T00:00:00.000Z'
    };

    const result = TimeOffRequestFilterSchema.safeParse(validFilter);
    expect(result.success).toBe(true);
  });

  it('should validate filter with only required fields', () => {
    const minimalFilter = {
      userId: '123e4567-e89b-12d3-a456-426614174000'
    };

    const result = TimeOffRequestFilterSchema.safeParse(minimalFilter);
    expect(result.success).toBe(true);
  });

  it('should reject invalid status', () => {
    const invalidFilter = {
      userId: '123e4567-e89b-12d3-a456-426614174000',
      status: 'INVALID_STATUS'
    };

    const result = TimeOffRequestFilterSchema.safeParse(invalidFilter);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('Invalid enum value');
    }
  });
});
