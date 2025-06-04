import Database from 'better-sqlite3';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

interface TimeOffBalance {
  id: string;
  user_id: string;
  vacation_days: number;
  sick_days: number;
  paid_leave: number;
  personal_days: number;
  year: number;
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS time_off_balance (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      vacation_days INTEGER DEFAULT 15,
      sick_days INTEGER DEFAULT 7,
      paid_leave INTEGER DEFAULT 3,
      personal_days INTEGER DEFAULT 3,
      year INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, year),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS time_off_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      start_date DATETIME NOT NULL,
      end_date DATETIME NOT NULL,
      type TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING',
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    
    CREATE TABLE IF NOT EXISTS overtime_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      hours REAL NOT NULL,
      request_date DATE NOT NULL,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      status TEXT DEFAULT 'PENDING',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
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
    INSERT INTO time_off_balance (id, user_id, vacation_days, sick_days, paid_leave, personal_days, year)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),

  getTimeOffBalance: db.prepare(`
    SELECT * FROM time_off_balance WHERE user_id = ? AND year = ?
  `).get,

  updateTimeOffBalance: db.prepare(`
    UPDATE time_off_balance
    SET vacation_days = ?, sick_days = ?, paid_leave = ?, personal_days = ?
    WHERE user_id = ? AND year = ?
  `),

  getUserTimeOffBalance: db.prepare(`
    SELECT * FROM time_off_balance WHERE user_id = ? AND year = ?
  `).get,

  createOrUpdateTimeOffBalance: function(id: string, userId: string, vacationDays: number, sickDays: number, paidLeave: number, personalDays: number, year: number) {
    if (!db || !this.getUserTimeOffBalance || !this.updateTimeOffBalance || !this.createTimeOffBalance) {
      throw new Error('Database operations not available');
    }

    const existingBalance = this.getUserTimeOffBalance(userId, year);
    if (existingBalance) {
      this.updateTimeOffBalance.run(vacationDays, sickDays, paidLeave, personalDays, userId, year);
    } else {
      this.createTimeOffBalance.run(id, userId, vacationDays, sickDays, paidLeave, personalDays, year);
    }
  },

  // Time off request operations
  createTimeOffRequest: db.prepare(`
    INSERT INTO time_off_requests (id, user_id, start_date, end_date, type, status, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),

  getTimeOffRequests: db.prepare(`
    SELECT r.*, u.name as user_name
    FROM time_off_requests r
    JOIN users u ON r.user_id = u.id
    WHERE r.status = ?
  `).all,

  getUserTimeOffRequests: db.prepare(`
    SELECT * FROM time_off_requests WHERE user_id = ?
  `).all,

  getAllTimeOffRequests: db.prepare(`
    SELECT * FROM time_off_requests
  `).all,

  updateTimeOffRequestStatus: db.prepare(`
    UPDATE time_off_requests
    SET status = ?
    WHERE id = ?
  `),

  // Overtime request operations
  createOvertimeRequest: db.prepare(`
    INSERT INTO overtime_requests (id, user_id, hours, request_date, month, year, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),

  getUserOvertimeRequests: db.prepare(`
    SELECT * FROM overtime_requests WHERE user_id = ?
  `).all,

  getAllOvertimeRequests: db.prepare(`
    SELECT * FROM overtime_requests
  `).all,

  getOvertimeRequestsByStatus: db.prepare(`
    SELECT o.*, u.name as user_name
    FROM overtime_requests o
    JOIN users u ON o.user_id = u.id
    WHERE o.status = ? ORDER BY o.created_at DESC
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
    const balance = this.getUserTimeOffBalance(userId, year) as TimeOffBalance | undefined;
    
    if (balance) {
      // Update balance with added vacation days
      const newVacationDays = balance.vacation_days + daysToAdd;
      return this.updateTimeOffBalance.run(
        newVacationDays,
        balance.sick_days,
        balance.paid_leave,
        balance.personal_days,
        userId,
        year
      );
    } else {
      // Create new balance if none exists
      const balanceId = randomUUID();
      return this.createTimeOffBalance.run(
        balanceId,
        userId,
        daysToAdd, // Start with the overtime days
        8, // Default sick days
        0, // Default paid leave
        3, // Default personal days
        year
      );
    }
  }
} : null; 