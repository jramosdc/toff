import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestManager } from '../request-manager';
import { TransactionManager } from '../db/transaction';
import { AuditLogger } from '../audit';
import { BalanceManager } from '../balance-manager';
import { TimeOffValidator } from '../validators/time-off';
import { PrismaClient } from '@prisma/client';
import { DatabaseError, ValidationError } from '../errors/time-off';

// Mock dependencies
const mockPrisma = {
  timeOffRequest: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
} as unknown as PrismaClient;

const mockTransactionManager = {
  execute: vi.fn(),
} as unknown as TransactionManager;

const mockAuditLogger = {
  log: vi.fn(),
} as unknown as AuditLogger;

const mockBalanceManager = {
  deductBalance: vi.fn(),
  restoreBalance: vi.fn(),
} as unknown as BalanceManager;

const mockValidator = {
  validateRequest: vi.fn(),
} as unknown as TimeOffValidator;

describe('RequestManager', () => {
  let requestManager: RequestManager;

  beforeEach(() => {
    vi.clearAllMocks();
    requestManager = new RequestManager(
      mockPrisma,
      mockTransactionManager,
      mockAuditLogger,
      mockBalanceManager,
      mockValidator
    );
  });

  describe('createRequest', () => {
    it('should create request successfully in production environment', async () => {
      const originalEnv = process.env;
      process.env.VERCEL = 'true';

      const mockValidationResult = {
        isValid: true,
        errors: [],
      };

      const mockRequest = {
        id: 'request-1',
        userId: 'user-1',
        type: 'VACATION',
        startDate: new Date('2025-01-20'),
        endDate: new Date('2025-01-24'),
        workingDays: 5,
        status: 'PENDING',
        reason: 'Vacation',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockTransaction = {
        timeOffRequest: {
          create: vi.fn().mockResolvedValue(mockRequest),
        },
      };

      vi.mocked(mockValidator.validateRequest).mockResolvedValue(mockValidationResult);
      vi.mocked(mockTransactionManager.execute).mockImplementation(async (callback) => {
        return callback(mockTransaction);
      });

      const result = await requestManager.createRequest(
        'user-1',
        'VACATION',
        new Date('2025-01-20'),
        new Date('2025-01-24'),
        'Vacation'
      );

      expect(result).toBeDefined();
      expect(result.id).toBe('request-1');
      expect(mockValidator.validateRequest).toHaveBeenCalled();
      expect(mockTransactionManager.execute).toHaveBeenCalled();
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        'user-1',
        'CREATE',
        'REQUEST',
        'request-1',
        expect.objectContaining({
          type: 'VACATION',
          workingDays: 5,
        })
      );

      process.env = originalEnv;
    });

    it('should throw ValidationError when validation fails', async () => {
      const mockValidationResult = {
        isValid: false,
        errors: [{ code: 'INVALID_DATES', message: 'Start date must be before end date' }],
      };

      vi.mocked(mockValidator.validateRequest).mockResolvedValue(mockValidationResult);

      await expect(
        requestManager.createRequest(
          'user-1',
          'VACATION',
          new Date('2025-01-24'),
          new Date('2025-01-20'),
          'Vacation'
        )
      ).rejects.toThrow(ValidationError);

      expect(mockValidator.validateRequest).toHaveBeenCalled();
    });

    it('should throw DatabaseError when database operation fails', async () => {
      const originalEnv = process.env;
      process.env.VERCEL = 'true';

      const mockValidationResult = {
        isValid: true,
        errors: [],
      };

      vi.mocked(mockValidator.validateRequest).mockResolvedValue(mockValidationResult);

      const mockTransaction = {
        timeOffRequest: {
          create: vi.fn().mockRejectedValue(new Error('Database connection failed')),
        },
      };

      vi.mocked(mockTransactionManager.execute).mockImplementation(async (callback) => {
        return callback(mockTransaction);
      });

      await expect(
        requestManager.createRequest(
          'user-1',
          'VACATION',
          new Date('2025-01-20'),
          new Date('2025-01-24'),
          'Vacation'
        )
      ).rejects.toThrow(DatabaseError);

      process.env = originalEnv;
    });
  });

  describe('approveRequest', () => {
    it('should approve request successfully in production', async () => {
      const originalEnv = process.env;
      process.env.VERCEL = 'true';

      const mockRequest = {
        id: 'request-1',
        userId: 'user-1',
        type: 'VACATION',
        startDate: new Date('2025-01-20'),
        endDate: new Date('2025-01-24'),
        workingDays: 5,
        status: 'PENDING',
        reason: 'Vacation',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockUpdatedRequest = {
        ...mockRequest,
        status: 'APPROVED',
      };

      const mockTransaction = {
        timeOffRequest: {
          findUnique: vi.fn().mockResolvedValue(mockRequest),
          update: vi.fn().mockResolvedValue(mockUpdatedRequest),
        },
      };

      vi.mocked(mockTransactionManager.execute).mockImplementation(async (callback) => {
        return callback(mockTransaction);
      });

      vi.mocked(mockBalanceManager.deductBalance).mockResolvedValue({} as any);

      const result = await requestManager.approveRequest('request-1', 'admin-1', 2025);

      expect(result).toBeDefined();
      expect(result.status).toBe('APPROVED');
      expect(mockBalanceManager.deductBalance).toHaveBeenCalledWith(
        'user-1',
        2025,
        'VACATION',
        5,
        'Approved time off request request-1'
      );
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        'admin-1',
        'UPDATE',
        'REQUEST',
        'request-1',
        expect.objectContaining({
          previousStatus: 'PENDING',
          newStatus: 'APPROVED',
        })
      );

      process.env = originalEnv;
    });

    it('should throw DatabaseError when request not found', async () => {
      const originalEnv = process.env;
      process.env.VERCEL = 'true';

      const mockTransaction = {
        timeOffRequest: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      };

      vi.mocked(mockTransactionManager.execute).mockImplementation(async (callback) => {
        return callback(mockTransaction);
      });

      await expect(
        requestManager.approveRequest('request-1', 'admin-1', 2025)
      ).rejects.toThrow(DatabaseError);

      process.env = originalEnv;
    });

    it('should throw ValidationError when request is not pending', async () => {
      const originalEnv = process.env;
      process.env.VERCEL = 'true';

      const mockRequest = {
        id: 'request-1',
        userId: 'user-1',
        type: 'VACATION',
        startDate: new Date('2025-01-20'),
        endDate: new Date('2025-01-24'),
        workingDays: 5,
        status: 'APPROVED', // Already approved
        reason: 'Vacation',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockTransaction = {
        timeOffRequest: {
          findUnique: vi.fn().mockResolvedValue(mockRequest),
        },
      };

      vi.mocked(mockTransactionManager.execute).mockImplementation(async (callback) => {
        return callback(mockTransaction);
      });

      await expect(
        requestManager.approveRequest('request-1', 'admin-1', 2025)
      ).rejects.toThrow(ValidationError);

      process.env = originalEnv;
    });
  });

  describe('rejectRequest', () => {
    it('should reject request successfully in production', async () => {
      const originalEnv = process.env;
      process.env.VERCEL = 'true';

      const mockRequest = {
        id: 'request-1',
        userId: 'user-1',
        type: 'VACATION',
        startDate: new Date('2025-01-20'),
        endDate: new Date('2025-01-24'),
        workingDays: 5,
        status: 'PENDING',
        reason: 'Vacation',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockUpdatedRequest = {
        ...mockRequest,
        status: 'REJECTED',
        reason: 'Business needs',
      };

      const mockTransaction = {
        timeOffRequest: {
          findUnique: vi.fn().mockResolvedValue(mockRequest),
          update: vi.fn().mockResolvedValue(mockUpdatedRequest),
        },
      };

      vi.mocked(mockTransactionManager.execute).mockImplementation(async (callback) => {
        return callback(mockTransaction);
      });

      const result = await requestManager.rejectRequest('request-1', 'admin-1', 'Business needs');

      expect(result).toBeDefined();
      expect(result.status).toBe('REJECTED');
      expect(result.reason).toBe('Business needs');
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        'admin-1',
        'UPDATE',
        'REQUEST',
        'request-1',
        expect.objectContaining({
          previousStatus: 'PENDING',
          newStatus: 'REJECTED',
          reason: 'Business needs',
        })
      );

      process.env = originalEnv;
    });
  });

  describe('deleteRequest', () => {
    it('should delete request successfully in production', async () => {
      const originalEnv = process.env;
      process.env.VERCEL = 'true';

      const mockRequest = {
        id: 'request-1',
        userId: 'user-1',
        type: 'VACATION',
        startDate: new Date('2025-01-20'),
        endDate: new Date('2025-01-24'),
        workingDays: 5,
        status: 'PENDING',
        reason: 'Vacation',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockTransaction = {
        timeOffRequest: {
          findUnique: vi.fn().mockResolvedValue(mockRequest),
          delete: vi.fn().mockResolvedValue(mockRequest),
        },
      };

      vi.mocked(mockTransactionManager.execute).mockImplementation(async (callback) => {
        return callback(mockTransaction);
      });

      await requestManager.deleteRequest('request-1', 'user-1', 2025);

      expect(mockTransaction.timeOffRequest.delete).toHaveBeenCalledWith({
        where: { id: 'request-1' }
      });
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        'user-1',
        'DELETE',
        'REQUEST',
        'request-1',
        expect.objectContaining({
          type: 'VACATION',
          status: 'PENDING',
        })
      );

      process.env = originalEnv;
    });

    it('should restore balance when deleting approved request', async () => {
      const originalEnv = process.env;
      process.env.VERCEL = 'true';

      const mockRequest = {
        id: 'request-1',
        userId: 'user-1',
        type: 'VACATION',
        startDate: new Date('2025-01-20'),
        endDate: new Date('2025-01-24'),
        workingDays: 5,
        status: 'APPROVED', // Approved request
        reason: 'Vacation',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockTransaction = {
        timeOffRequest: {
          findUnique: vi.fn().mockResolvedValue(mockRequest),
          delete: vi.fn().mockResolvedValue(mockRequest),
        },
      };

      vi.mocked(mockTransactionManager.execute).mockImplementation(async (callback) => {
        return callback(mockTransaction);
      });

      vi.mocked(mockBalanceManager.restoreBalance).mockResolvedValue({} as any);

      await requestManager.deleteRequest('request-1', 'user-1', 2025);

      expect(mockBalanceManager.restoreBalance).toHaveBeenCalledWith(
        'user-1',
        2025,
        'VACATION',
        5,
        'Deleted time off request request-1'
      );

      process.env = originalEnv;
    });

    it('should throw ValidationError when user is not authorized to delete', async () => {
      const originalEnv = process.env;
      process.env.VERCEL = 'true';

      const mockRequest = {
        id: 'request-1',
        userId: 'user-2', // Different user
        type: 'VACATION',
        startDate: new Date('2025-01-20'),
        endDate: new Date('2025-01-24'),
        workingDays: 5,
        status: 'PENDING',
        reason: 'Vacation',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockTransaction = {
        timeOffRequest: {
          findUnique: vi.fn().mockResolvedValue(mockRequest),
        },
      };

      vi.mocked(mockTransactionManager.execute).mockImplementation(async (callback) => {
        return callback(mockTransaction);
      });

      await expect(
        requestManager.deleteRequest('request-1', 'user-1', 2025)
      ).rejects.toThrow(ValidationError);

      process.env = originalEnv;
    });
  });
});
