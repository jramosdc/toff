import { PrismaClient } from '@prisma/client';
import { DatabaseError } from '../errors/time-off';

export interface DatabaseAdapter {
  query<T>(sql: string, params?: any[]): Promise<T[]>;
  execute<T>(sql: string, params?: any[]): Promise<T>;
  transaction<T>(operation: (tx: any) => Promise<T>): Promise<T>;
}

export class PrismaAdapter implements DatabaseAdapter {
  constructor(private prisma: PrismaClient) {}

  async query<T>(sql: string, params?: any[]): Promise<T[]> {
    if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
      return this.prisma.$queryRawUnsafe(sql, ...(params || []));
    } else if (process.env.NODE_ENV === 'development') {
      const db = (this.prisma as any).$queryRaw;
      if (!db) {
        throw new DatabaseError('Database connection not available');
      }
      return db(sql, ...(params || []));
    }
    throw new DatabaseError('Unsupported environment');
  }

  async execute<T>(sql: string, params?: any[]): Promise<T> {
    const results = await this.query<T>(sql, params);
    return results[0];
  }

  async transaction<T>(operation: (tx: any) => Promise<T>): Promise<T> {
    if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
      return this.prisma.$transaction(operation);
    } else if (process.env.NODE_ENV === 'development') {
      const db = (this.prisma as any).$queryRaw;
      if (!db) {
        throw new DatabaseError('Database connection not available');
      }
      await db`BEGIN TRANSACTION`;
      try {
        const result = await operation(this.prisma);
        await db`COMMIT`;
        return result;
      } catch (error) {
        await db`ROLLBACK`;
        throw error;
      }
    }
    throw new DatabaseError('Unsupported environment');
  }
}

export function createDatabaseAdapter(prisma: PrismaClient): DatabaseAdapter {
  return new PrismaAdapter(prisma);
} 