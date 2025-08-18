import Database from 'better-sqlite3';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

interface TimeOffBalance {
  id: string;
  userId: string;
  year: number;
  type: string;
  totalDays: number;
  usedDays: number;
  remainingDays: number;
  createdAt: string;
  updatedAt: string;
}

// Check if we're using Prisma with PostgreSQL or running on Vercel
export const isPrismaEnabled = process.env.VERCEL || process.env.DATABASE_URL?.includes('postgresql') || process.env.USE_PRISMA === 'true';

// Properly declare global prisma type
declare global {
  namespace globalThis {
    var __prisma: PrismaClient | undefined;
  }
}

// Initialize Prisma if PostgreSQL is configured or on Vercel
let prismaClient: PrismaClient | undefined;
if (isPrismaEnabled) {
  prismaClient = globalThis.__prisma || new PrismaClient();
  if (process.env.NODE_ENV !== 'production') {
    globalThis.__prisma = prismaClient;
  }
}
export const prisma = prismaClient;

// Initialize SQLite only if not using Prisma and not on Vercel
const db = (!isPrismaEnabled && !process.env.VERCEL) 
  ? new Database(join(process.cwd(), 'toff.db'), { verbose: console.log })
  : null;

// Initialize database tables only if using SQLite
if (db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT,
      role TEXT DEFAULT 'EMPLOYEE',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS time_off_balance (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      year INTEGER NOT NULL,
      type TEXT NOT NULL,
      totalDays REAL NOT NULL,
      usedDays REAL DEFAULT 0,
      remainingDays REAL NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(userId, year, type),
      FOREIGN KEY (userId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS time_off_requests (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      type TEXT NOT NULL,
      startDate DATETIME NOT NULL,
      endDate DATETIME NOT NULL,
      workingDays REAL NOT NULL,
      status TEXT DEFAULT 'PENDING',
      reason TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(userId, startDate, endDate, type),
      FOREIGN KEY (userId) REFERENCES users(id)
    );
    
    CREATE TABLE IF NOT EXISTS overtime_requests (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      hours REAL NOT NULL,
      requestDate DATE NOT NULL,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      status TEXT DEFAULT 'PENDING',
      notes TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      action TEXT NOT NULL,
      entityType TEXT NOT NULL,
      entityId TEXT NOT NULL,
      details TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id)
    );
  `);
}

export default db;

// Helper functions for database operations
export const dbOperations = db ? {
  // User operations
  createUser: db.prepare(`
    INSERT INTO users (id, name, email, password, role)
    VALUES (?, ?, ?, ?, ?)
  `),

  getUserByEmail: db.prepare(`
    SELECT * FROM users WHERE email = ?
  `).get,

  getUserById: db.prepare(`
    SELECT * FROM users WHERE id = ?
  `).get,

  getAllUsers: db.prepare(`
    SELECT * FROM users
  `).all,

  getAdminUsers: db.prepare(`
    SELECT id, email, name FROM users WHERE role = 'ADMIN'
  `).all,

  // Time off balance operations
  createTimeOffBalance: db.prepare(`
    INSERT INTO time_off_balance (id, userId, year, type, totalDays, usedDays, remainingDays)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),

  getTimeOffBalance: db.prepare(`
    SELECT * FROM time_off_balance WHERE userId = ? AND year = ? AND type = ?
  `).get,

  updateTimeOffBalance: db.prepare(`
    UPDATE time_off_balance
    SET totalDays = ?, usedDays = ?, remainingDays = ?, updatedAt = CURRENT_TIMESTAMP
    WHERE userId = ? AND year = ? AND type = ?
  `),

  getUserTimeOffBalance: db.prepare(`
    SELECT * FROM time_off_balance WHERE userId = ? AND year = ? AND type = ?
  `).get,

  getAllUserTimeOffBalances: db.prepare(`
    SELECT * FROM time_off_balance WHERE userId = ? AND year = ?
  `).all,

  createOrUpdateTimeOffBalance: function(id: string, userId: string, year: number, type: string, totalDays: number, usedDays: number, remainingDays: number) {
    if (!db || !this.getUserTimeOffBalance || !this.updateTimeOffBalance || !this.createTimeOffBalance) {
      throw new Error('Database operations not available');
    }

    const existingBalance = this.getUserTimeOffBalance(userId, year, type);
    if (existingBalance) {
      this.updateTimeOffBalance.run(totalDays, usedDays, remainingDays, userId, year, type);
    } else {
      this.createTimeOffBalance.run(id, userId, year, type, totalDays, usedDays, remainingDays);
    }
  },

  // Initialize default balances for a user
  initializeUserBalances: function(userId: string, year: number) {
    if (!db || !this.createTimeOffBalance) {
      throw new Error('Database operations not available');
    }

    const defaultBalances = [
      { type: 'VACATION', totalDays: 15, usedDays: 0, remainingDays: 15 },
      { type: 'SICK', totalDays: 7, usedDays: 0, remainingDays: 7 },
      { type: 'PAID_LEAVE', totalDays: 3, usedDays: 0, remainingDays: 3 },
      { type: 'PERSONAL', totalDays: 3, usedDays: 0, remainingDays: 3 }
    ];

    defaultBalances.forEach(balance => {
      const balanceId = randomUUID();
      this.createTimeOffBalance.run(
        balanceId,
        userId,
        year,
        balance.type,
        balance.totalDays,
        balance.usedDays,
        balance.remainingDays
      );
    });
  },

  // Time off request operations
  createTimeOffRequest: db.prepare(`
    INSERT INTO time_off_requests (id, userId, type, startDate, endDate, workingDays, status, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),

  getTimeOffRequests: db.prepare(`
    SELECT r.*, u.name as user_name
    FROM time_off_requests r
    JOIN users u ON r.userId = u.id
    WHERE r.status = ?
  `).all,

  getUserTimeOffRequests: db.prepare(`
    SELECT * FROM time_off_requests WHERE userId = ?
  `).all,

  getAllTimeOffRequests: db.prepare(`
    SELECT * FROM time_off_requests
  `).all,

  updateTimeOffRequestStatus: db.prepare(`
    UPDATE time_off_requests
    SET status = ?, updatedAt = CURRENT_TIMESTAMP
    WHERE id = ?
  `),

  getTimeOffRequestById: db.prepare(`
    SELECT * FROM time_off_requests WHERE id = ?
  `).get,

  // Overtime request operations
  createOvertimeRequest: db.prepare(`
    INSERT INTO overtime_requests (id, userId, hours, requestDate, month, year, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),

  getUserOvertimeRequests: db.prepare(`
    SELECT * FROM overtime_requests WHERE userId = ?
  `).all,

  getAllOvertimeRequests: db.prepare(`
    SELECT * FROM overtime_requests
  `).all,

  getOvertimeRequestsByStatus: db.prepare(`
    SELECT o.*, u.name as user_name
    FROM overtime_requests o
    JOIN users u ON o.userId = u.id
    WHERE o.status = ? ORDER BY o.createdAt DESC
  `).all,

  updateOvertimeRequestStatus: db.prepare(`
    UPDATE overtime_requests
    SET status = ?
    WHERE id = ?
  `),

  // Adds vacation days when overtime is approved
  addVacationDaysFromOvertime: function(userId: string, hours: number, year: number) {
    if (!db || !this.getUserTimeOffBalance || !this.updateTimeOffBalance || !this.createTimeOffBalance) {
      throw new Error('Database operations not available');
    }

    // Convert hours to days (8 hours = 1 day)
    const daysToAdd = hours / 8;
    
    // Get current balance
    const balance = this.getUserTimeOffBalance(userId, year, 'VACATION') as TimeOffBalance | undefined;
    
    if (balance) {
      // Update balance with added vacation days
      const newTotalDays = balance.totalDays + daysToAdd;
      const newRemainingDays = newTotalDays - balance.usedDays;
      return this.updateTimeOffBalance.run(
        newTotalDays,
        balance.usedDays,
        newRemainingDays,
        userId,
        year,
        'VACATION'
      );
    } else {
      // Create new balance if none exists
      const balanceId = randomUUID();
      return this.createTimeOffBalance.run(
        balanceId,
        userId,
        year,
        'VACATION',
        daysToAdd, // Start with the overtime days
        0, // Default used days
        daysToAdd // Default remaining days
      );
    }
  }
} : null; 