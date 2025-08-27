import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BalanceManager } from '../balance-manager';
import { TransactionManager } from '../db/transaction';
import { AuditLogger } from '../audit';
import { PrismaClient } from '@prisma/client';
import { InsufficientBalanceError, DatabaseError } from '../errors/time-off';

// Mock dependencies
const mockPrisma = {
  timeOffBalance: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
} as unknown as PrismaClient;

const mockTransactionManager = {
  execute: vi.fn(),
} as unknown as TransactionManager;

const mockAuditLogger = {
  log: vi.fn(),
} as unknown as AuditLogger;

describe('BalanceManager', () => {
  let balanceManager: BalanceManager;

  beforeEach(() => {
    vi.clearAllMocks();
    balanceManager = new BalanceManager(mockPrisma, mockTransactionManager, mockAuditLogger);
  });

  describe('getBalance', () => {
    it('should fetch balance successfully in production environment', async () => {
      // Mock environment
      const originalEnv = process.env;
      process.env.VERCEL = 'true';

      const mockBalance = {
        id: 'balance-1',
        userId: 'user-1',
        year: 2025,
        type: 'VACATION',
        totalDays: 15,
        usedDays: 5,
        remainingDays: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(mockPrisma.timeOffBalance.findUnique).mockResolvedValue(mockBalance);

      const result = await balanceManager.getBalance('user-1', 2025, 'VACATION');

      expect(result).toBeDefined();
      expect(mockPrisma.timeOffBalance.findUnique).toHaveBeenCalledWith({
        where: {
          userId_year_type: {
            userId: 'user-1',
            year: 2025,
            type: 'VACATION'
          }
        }
      });

      // Restore environment
      process.env = originalEnv;
    });

    it('should throw DatabaseError when balance not found in production', async () => {
      const originalEnv = process.env;
      process.env.VERCEL = 'true';

      vi.mocked(mockPrisma.timeOffBalance.findUnique).mockResolvedValue(null);

      await expect(
        balanceManager.getBalance('user-1', 2025, 'VACATION')
      ).rejects.toThrow(DatabaseError);

      process.env = originalEnv;
    });

    it('should throw DatabaseError for unsupported environment', async () => {
      const originalEnv = process.env;
      delete process.env.VERCEL;
      delete process.env.NODE_ENV;

      await expect(
        balanceManager.getBalance('user-1', 2025, 'VACATION')
      ).rejects.toThrow(DatabaseError);

      process.env = originalEnv;
    });
  });

  describe('updateBalance', () => {
    it('should update balance successfully in production', async () => {
      const originalEnv = process.env;
      process.env.VERCEL = 'true';

      const mockBalance = {
        id: 'balance-1',
        userId: 'user-1',
        year: 2025,
        type: 'VACATION',
        totalDays: 15,
        usedDays: 5,
        remainingDays: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockUpdatedBalance = {
        ...mockBalance,
        usedDays: 7,
        remainingDays: 8,
      };

      const mockTransaction = {
        timeOffBalance: {
          update: vi.fn().mockResolvedValue(mockUpdatedBalance),
        },
      };

      vi.mocked(mockTransactionManager.execute).mockImplementation(async (callback) => {
        return callback(mockTransaction);
      });

      vi.mocked(mockPrisma.timeOffBalance.findUnique).mockResolvedValue(mockBalance);

      const result = await balanceManager.updateBalance(
        'user-1',
        2025,
        'VACATION',
        2,
        'Test update'
      );

      expect(result).toBeDefined();
      expect(mockTransactionManager.execute).toHaveBeenCalled();
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        'user-1',
        'UPDATE',
        'BALANCE',
        'balance-1',
        expect.objectContaining({
          type: 'VACATION',
          previousBalance: 10,
          newBalance: 8,
          change: 2,
        })
      );

      process.env = originalEnv;
    });

    it('should throw InsufficientBalanceError when deducting more than available', async () => {
      const originalEnv = process.env;
      process.env.VERCEL = 'true';

      const mockBalance = {
        id: 'balance-1',
        userId: 'user-1',
        year: 2025,
        type: 'VACATION',
        totalDays: 15,
        usedDays: 5,
        remainingDays: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(mockPrisma.timeOffBalance.findUnique).mockResolvedValue(mockBalance);

      await expect(
        balanceManager.updateBalance('user-1', 2025, 'VACATION', 15, 'Test update')
      ).rejects.toThrow(InsufficientBalanceError);

      process.env = originalEnv;
    });

    it('should handle database errors gracefully', async () => {
      const originalEnv = process.env;
      process.env.VERCEL = 'true';

      const mockBalance = {
        id: 'balance-1',
        userId: 'user-1',
        year: 2025,
        type: 'VACATION',
        totalDays: 15,
        usedDays: 5,
        remainingDays: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(mockPrisma.timeOffBalance.findUnique).mockResolvedValue(mockBalance);

      const mockTransaction = {
        timeOffBalance: {
          update: vi.fn().mockRejectedValue(new Error('Database connection failed')),
        },
      };

      vi.mocked(mockTransactionManager.execute).mockImplementation(async (callback) => {
        return callback(mockTransaction);
      });

      await expect(
        balanceManager.updateBalance('user-1', 2025, 'VACATION', 2, 'Test update')
      ).rejects.toThrow(DatabaseError);

      process.env = originalEnv;
    });
  });

  describe('restoreBalance', () => {
    it('should restore balance by calling updateBalance with negative days', async () => {
      const originalEnv = process.env;
      process.env.VERCEL = 'true';

      const mockBalance = {
        id: 'balance-1',
        userId: 'user-1',
        year: 2025,
        type: 'VACATION',
        totalDays: 15,
        usedDays: 7,
        remainingDays: 8,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockUpdatedBalance = {
        ...mockBalance,
        usedDays: 5,
        remainingDays: 10,
      };

      const mockTransaction = {
        timeOffBalance: {
          update: vi.fn().mockResolvedValue(mockUpdatedBalance),
        },
      };

      vi.mocked(mockTransactionManager.execute).mockImplementation(async (callback) => {
        return callback(mockTransaction);
      });

      vi.mocked(mockPrisma.timeOffBalance.findUnique).mockResolvedValue(mockBalance);

      const result = await balanceManager.restoreBalance(
        'user-1',
        2025,
        'VACATION',
        2,
        'Test restore'
      );

      expect(result).toBeDefined();
      expect(mockTransactionManager.execute).toHaveBeenCalled();

      process.env = originalEnv;
    });
  });

  describe('deductBalance', () => {
    it('should deduct balance by calling updateBalance with positive days', async () => {
      const originalEnv = process.env;
      process.env.VERCEL = 'true';

      const mockBalance = {
        id: 'balance-1',
        userId: 'user-1',
        year: 2025,
        type: 'VACATION',
        totalDays: 15,
        usedDays: 5,
        remainingDays: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockUpdatedBalance = {
        ...mockBalance,
        usedDays: 7,
        remainingDays: 8,
      };

      const mockTransaction = {
        timeOffBalance: {
          update: vi.fn().mockResolvedValue(mockUpdatedBalance),
        },
      };

      vi.mocked(mockTransactionManager.execute).mockImplementation(async (callback) => {
        return callback(mockTransaction);
      });

      vi.mocked(mockPrisma.timeOffBalance.findUnique).mockResolvedValue(mockBalance);

      const result = await balanceManager.deductBalance(
        'user-1',
        2025,
        'VACATION',
        2,
        'Test deduction'
      );

      expect(result).toBeDefined();
      expect(mockTransactionManager.execute).toHaveBeenCalled();

      process.env = originalEnv;
    });
  });
});
