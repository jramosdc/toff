import Database from 'better-sqlite3';
import { PrismaClient } from '@prisma/client';
import { DatabaseError } from '../errors/time-off';

export interface DatabaseAdapter {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  execute<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  transaction<T>(operation: (tx: PrismaClient) => Promise<T>): Promise<T>;
}

export class PrismaAdapter implements DatabaseAdapter {
  constructor(private prisma: PrismaClient) {}

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    return this.prisma.$queryRawUnsafe<T[]>(sql, ...(params ?? []));
  }

  async execute<T>(sql: string, params?: unknown[]): Promise<T | undefined> {
    const results = await this.query<T>(sql, params);
    return results[0];
  }

  async transaction<T>(operation: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(operation);
  }
}

// better-sqlite3 transactions are synchronous, so async operations cannot be
// wrapped in a native SQLite transaction. In development, operations run without
// transaction isolation.
export class SQLiteAdapter implements DatabaseAdapter {
  constructor(private db: Database.Database) {}

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    return this.db.prepare(sql).all(...(params ?? [])) as T[];
  }

  async execute<T>(sql: string, params?: unknown[]): Promise<T | undefined> {
    return this.db.prepare(sql).get(...(params ?? [])) as T | undefined;
  }

  async transaction<T>(operation: (tx: any) => Promise<T>): Promise<T> {
    return operation(this.db);
  }
}

export function createDatabaseAdapter(
  prisma: PrismaClient | null | undefined,
  db?: Database.Database | null
): DatabaseAdapter {
  if (prisma) return new PrismaAdapter(prisma);
  if (db) return new SQLiteAdapter(db);
  throw new DatabaseError('No database connection available');
}
