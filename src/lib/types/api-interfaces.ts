// Standardized API interfaces for consistent camelCase naming across all API communications
// This serves as the single source of truth for API interface definitions

// Core entity interfaces with camelCase naming
export interface StandardUser {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'EMPLOYEE';
  createdAt?: Date;
  updatedAt?: Date;
}

export interface StandardTimeOffRequest {
  id: string;
  userId: string;
  startDate: string; // ISO string for API transmission
  endDate: string;   // ISO string for API transmission
  type: 'VACATION' | 'SICK' | 'PAID_LEAVE' | 'PERSONAL';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason?: string;
  workingDays?: number;
  userName?: string; // Populated in joined queries
  createdAt?: string; // ISO string for API transmission
  updatedAt?: string; // ISO string for API transmission
}

export interface StandardOvertimeRequest {
  id: string;
  userId: string;
  hours: number;
  requestDate: string; // ISO string for API transmission
  month: number;
  year: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  notes?: string;
  userName?: string; // Populated in joined queries
  userEmail?: string; // Populated in joined queries
  createdAt?: string; // ISO string for API transmission
  updatedAt?: string; // ISO string for API transmission
}

export interface StandardTimeOffBalance {
  id: string;
  userId: string;
  year: number;
  vacationDays: number;
  sickDays: number;
  paidLeave: number;
  personalDays: number;
  createdAt?: string; // ISO string for API transmission
  updatedAt?: string; // ISO string for API transmission
}

// Request/Response interfaces for specific API endpoints
export interface CreateTimeOffRequestPayload {
  startDate: string;
  endDate: string;
  type: 'VACATION' | 'SICK' | 'PAID_LEAVE' | 'PERSONAL';
  reason?: string;
  userId?: string; // Optional for admin operations
}

export interface CreateOvertimeRequestPayload {
  hours: number;
  notes?: string;
  userId?: string; // Optional for admin operations
}

export interface UpdateBalancePayload {
  vacationDays?: number;
  sickDays?: number;
  paidLeave?: number;
  personalDays?: number;
}

export interface UpdateRequestStatusPayload {
  status: 'APPROVED' | 'REJECTED';
  adminNotes?: string;
}

// Response interfaces for API endpoints
export interface TimeOffRequestsResponse {
  requests: StandardTimeOffRequest[];
  total?: number;
}

export interface OvertimeRequestsResponse {
  requests: StandardOvertimeRequest[];
  total?: number;
}

export interface UserBalanceResponse {
  balance: StandardTimeOffBalance;
}

export interface UsersResponse {
  users: StandardUser[];
  total?: number;
}

// Error response interface
export interface ApiErrorResponse {
  error: string;
  code?: string;
  details?: Record<string, any>;
}

// Success response interface
export interface ApiSuccessResponse<T = any> {
  data: T;
  message?: string;
}

// Validation interfaces
export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

// Admin-specific interfaces
export interface AdminUserDetails extends StandardUser {
  timeOffBalance?: StandardTimeOffBalance;
  pendingRequests?: number;
  totalRequests?: number;
}

export interface AdminDashboardStats {
  totalUsers: number;
  pendingTimeOffRequests: number;
  pendingOvertimeRequests: number;
  totalRequestsThisMonth: number;
  usersWithLowBalance: number;
}

// Audit and reporting interfaces
export interface AuditLogEntry {
  id: string;
  userId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT';
  entityType: 'REQUEST' | 'BALANCE' | 'USER';
  entityId: string;
  details: Record<string, any>;
  createdAt: string;
} 