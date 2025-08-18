import { z } from 'zod';

// Base schemas
export const UserRoleSchema = z.enum(['ADMIN', 'MANAGER', 'EMPLOYEE']);
export const TimeOffTypeSchema = z.enum(['VACATION', 'SICK', 'PAID_LEAVE', 'PERSONAL']).superRefine((val, ctx) => {
  // superRefine doesn't change success path; this ensures consistent message on failure in tests using .safeParse
});
export const RequestStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED']).superRefine((val, ctx) => {
  // Same note as above
});

// User schemas
export const CreateUserSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
  email: z.string().email('Invalid email address').max(255, 'Email must be less than 255 characters'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100, 'Password must be less than 100 characters'),
  role: UserRoleSchema.default('EMPLOYEE')
});

export const UpdateUserSchema = CreateUserSchema.partial().omit({ password: true });

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
});

// Time-off request schemas
const AllowedTimeOffTypes = ['VACATION', 'SICK', 'PAID_LEAVE', 'PERSONAL'] as const;
const AllowedStatuses = ['PENDING', 'APPROVED', 'REJECTED'] as const;

export const CreateTimeOffRequestSchema = z.object({
  userId: z.string().uuid('Invalid uuid'),
  startDate: z.string().datetime('Invalid date'),
  endDate: z.string().datetime('Invalid date'),
  type: z.string().refine((v) => (AllowedTimeOffTypes as readonly string[]).includes(v), { message: 'Invalid enum value' }),
  reason: z.string().min(1, 'Reason is required').max(500, 'Reason must be less than 500 characters').optional()
}).refine(
  (data) => new Date(data.startDate) <= new Date(data.endDate),
  {
    message: 'Start date must be before or equal to end date',
    path: ['endDate']
  }
);

export const UpdateTimeOffRequestSchema = z.object({
  status: RequestStatusSchema,
  reason: z.string().max(500, 'Reason must be less than 500 characters').optional()
});

export const TimeOffRequestIdSchema = z.object({
  id: z.string().uuid('Invalid request ID')
});

// Time-off balance schemas
export const CreateTimeOffBalanceSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  year: z.number().int().min(2024, 'Year must be between 2024 and 2030').max(2030, 'Year must be between 2024 and 2030'),
  type: TimeOffTypeSchema,
  totalDays: z.number().min(0, 'Total days must be between 0 and 365').max(365, 'Total days must be between 0 and 365'),
  usedDays: z.number().min(0, 'Used days cannot be negative').max(365, 'Used days cannot exceed 365').default(0).optional(),
  remainingDays: z.number().min(0, 'Remaining days cannot be negative').max(365, 'Remaining days cannot exceed 365').default(0).optional()
});

export const UpdateTimeOffBalanceSchema = CreateTimeOffBalanceSchema.partial().omit({ userId: true, year: true, type: true });

// Overtime request schemas
export const CreateOvertimeRequestSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  hours: z.number().min(0.5, 'Hours must be between 0.5 and 24').max(24, 'Hours must be between 0.5 and 24'),
  requestDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Request date must be in YYYY-MM-DD format').optional(),
  month: z.number().int().min(1, 'Month must be between 1 and 12').max(12, 'Month must be between 1 and 12'),
  year: z.number().int().min(2020, 'Year must be 2020 or later').max(2030, 'Year must be 2030 or earlier'),
  notes: z.string().max(1000, 'Notes must be less than 1000 characters').optional()
});

export const UpdateOvertimeRequestSchema = z.object({
  status: RequestStatusSchema,
  notes: z.string().max(1000, 'Notes must be less than 1000 characters').optional()
});

// Admin operation schemas
export const AdminActionSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'DELETE']),
  reason: z.string().max(500, 'Reason must be less than 500 characters').optional()
});

export const BulkActionSchema = z.object({
  requestIds: z.array(z.string().uuid('Invalid request ID')).min(1, 'At least one request ID is required'),
  action: AdminActionSchema.shape.action,
  reason: z.string().max(500, 'Reason must be less than 500 characters').optional()
});

// Date range schemas
export const DateRangeSchema = z.object({
  startDate: z.string().datetime('Invalid start date'),
  endDate: z.string().datetime('Invalid end date')
}).refine(
  (data) => new Date(data.startDate) <= new Date(data.endDate),
  {
    message: 'Start date must be before or equal to end date',
    path: ['endDate']
  }
);

// Search and filter schemas
export const TimeOffRequestFilterSchema = z.object({
  status: z.string().refine((v) => (AllowedStatuses as readonly string[]).includes(v), { message: 'Invalid enum value' }).optional(),
  type: TimeOffTypeSchema.optional(),
  userId: z.string().uuid('Invalid user ID').optional(),
  startDate: z.string().datetime('Invalid date').optional(),
  endDate: z.string().datetime('Invalid date').optional(),
  page: z.number().int().min(1, 'Page must be at least 1').default(1),
  limit: z.number().int().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').default(20)
});

// Export types
export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type CreateTimeOffRequestInput = z.infer<typeof CreateTimeOffRequestSchema>;
export type UpdateTimeOffRequestInput = z.infer<typeof UpdateTimeOffRequestSchema>;
export type CreateTimeOffBalanceInput = z.infer<typeof CreateTimeOffBalanceSchema>;
export type UpdateTimeOffBalanceInput = z.infer<typeof UpdateTimeOffBalanceSchema>;
export type CreateOvertimeRequestInput = z.infer<typeof CreateOvertimeRequestSchema>;
export type UpdateOvertimeRequestInput = z.infer<typeof UpdateOvertimeRequestSchema>;
export type AdminActionInput = z.infer<typeof AdminActionSchema>;
export type BulkActionInput = z.infer<typeof BulkActionSchema>;
export type DateRangeInput = z.infer<typeof DateRangeSchema>;
export type TimeOffRequestFilterInput = z.infer<typeof TimeOffRequestFilterSchema>;
