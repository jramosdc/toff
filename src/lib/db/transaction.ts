import { PrismaClient } from '@prisma/client';
import { DatabaseError } from '../errors/time-off';
import { DatabaseAdapter, createDatabaseAdapter } from './adapter';

export class TransactionManager {
  private adapter: DatabaseAdapter;

  constructor(private prisma: PrismaClient) {
    this.adapter = createDatabaseAdapter(prisma);
  }

  async execute<T>(operation: (tx: PrismaClient) => Promise<T>): Promise<T> {
    try {
      return await this.adapter.transaction(operation);
    } catch (error) {
      if (error instanceof DatabaseError) {
        throw error;
      }
      throw new DatabaseError(
        `Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async withTransaction<T>(
    operation: (tx: PrismaClient) => Promise<T>
  ): Promise<T> {
    return this.execute(operation);
  }

  async withRetry<T>(
    operation: (tx: PrismaClient) => Promise<T>,
    options: {
      maxRetries?: number;
      retryDelay?: number;
    } = {}
  ): Promise<T> {
    return this.execute(operation, options);
  }
} 