import Database from 'better-sqlite3';
import { PrismaClient } from '@prisma/client';
import { DatabaseError } from '../errors/time-off';
import { DatabaseAdapter, createDatabaseAdapter } from './adapter';

export class TransactionManager {
  private adapter: DatabaseAdapter;

  constructor(
    private prisma: PrismaClient | null,
    private db: Database.Database | null = null
  ) {
    this.adapter = createDatabaseAdapter(prisma, db);
  }

  async execute<T>(operation: (tx: PrismaClient) => Promise<T>): Promise<T> {
    try {
      return await this.adapter.transaction(operation);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError(
        `Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async withTransaction<T>(operation: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return this.execute(operation);
  }

  async withRetry<T>(
    operation: (tx: PrismaClient) => Promise<T>,
    options: { maxRetries?: number; retryDelay?: number } = {}
  ): Promise<T> {
    const { maxRetries = 3, retryDelay = 100 } = options;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.execute(operation);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxRetries) {
          await new Promise(resolve =>
            setTimeout(resolve, retryDelay * Math.pow(2, attempt))
          );
        }
      }
    }

    throw lastError ?? new DatabaseError('Transaction failed after retries');
  }
}
