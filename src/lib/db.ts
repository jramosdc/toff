import Database from 'better-sqlite3';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';

interface TimeOffBalance {
  id: string;
  user_id: string;
  vacation_days: number;
  sick_days: number;
  paid_leave: number;
  year: number;
}

// Check if we're using Prisma with PostgreSQL
export const isPrismaEnabled = process.env.DATABASE_URL?.includes('postgresql');

// Initialize Prisma if PostgreSQL is configured
export const prisma = isPrismaEnabled ? new PrismaClient() : null;

// Initialize SQLite only if not using Prisma
const db = !isPrismaEnabled 
  ? new Database(join(process.cwd(), 'toff.db'), { verbose: console.log })
  : null;

// Initialize database tables only if using SQLite
if (db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'EMPLOYEE',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS time_off_balance (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      vacation_days INTEGER DEFAULT 0,
      sick_days INTEGER DEFAULT 0,
      paid_leave INTEGER DEFAULT 0,
      year INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, year)
    );

    CREATE TABLE IF NOT EXISTS time_off_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
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
export const dbOperations = {
  // User operations
  createUser: db?.prepare(`
    INSERT INTO users (id, email, name, password, role)
    VALUES (?, ?, ?, ?, ?)
  `),

  getUserByEmail: db?.prepare(`
    SELECT * FROM users WHERE email = ?
  `),

  getUserById: db?.prepare(`
    SELECT * FROM users WHERE id = ?
  `),

  getAllUsers: db?.prepare(`
    SELECT id, email, name, role FROM users
  `),

  getAdminUsers: db?.prepare(`
    SELECT id, email, name FROM users WHERE role = 'ADMIN'
  `),

  // Time off balance operations
  createTimeOffBalance: db?.prepare(`
    INSERT INTO time_off_balance (id, user_id, vacation_days, sick_days, paid_leave, year)
    VALUES (?, ?, ?, ?, ?, ?)
  `),

  getTimeOffBalance: db?.prepare(`
    SELECT * FROM time_off_balance WHERE user_id = ? AND year = ?
  `),

  updateTimeOffBalance: db?.prepare(`
    UPDATE time_off_balance
    SET vacation_days = ?, sick_days = ?, paid_leave = ?, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND year = ?
  `),

  getUserTimeOffBalance: db?.prepare(`
    SELECT * FROM time_off_balance WHERE user_id = ? AND year = ?
  `),

  createOrUpdateTimeOffBalance: function(id: string, userId: string, vacationDays: number, sickDays: number, paidLeave: number, year: number) {
    if (isPrismaEnabled) {
      return prisma?.timeOffBalance.upsert({
        where: { 
          userId_year: { userId, year }
        },
        update: {
          vacationDays,
          sickDays,
          paidLeave,
        },
        create: {
          id,
          userId,
          vacationDays,
          sickDays, 
          paidLeave,
          year
        }
      });
    }
    
    // For SQLite
    if (!db) return null;
    
    // Check if a record exists
    const existing = this.getUserTimeOffBalance.get(userId, year);
    
    if (existing) {
      // Update existing record
      return this.updateTimeOffBalance.run(vacationDays, sickDays, paidLeave, userId, year);
    } else {
      // Create new record
      return this.createTimeOffBalance.run(id, userId, vacationDays, sickDays, paidLeave, year);
    }
  },

  // Time off request operations
  createTimeOffRequest: db?.prepare(`
    INSERT INTO time_off_requests (id, user_id, start_date, end_date, type, reason)
    VALUES (?, ?, ?, ?, ?, ?)
  `),

  getTimeOffRequests: db?.prepare(`
    SELECT r.*, u.name as user_name
    FROM time_off_requests r
    JOIN users u ON r.user_id = u.id
    WHERE r.status = ?
  `),

  getUserTimeOffRequests: db?.prepare(`
    SELECT * FROM time_off_requests WHERE user_id = ?
  `),

  updateTimeOffRequestStatus: db?.prepare(`
    UPDATE time_off_requests
    SET status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `),

  // Overtime request operations
  createOvertimeRequest: db?.prepare(`
    INSERT INTO overtime_requests (id, user_id, hours, request_date, month, year, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),

  getUserOvertimeRequests: db?.prepare(`
    SELECT * FROM overtime_requests WHERE user_id = ? ORDER BY created_at DESC
  `),

  getAllOvertimeRequests: db?.prepare(`
    SELECT o.*, u.name as user_name, u.email as user_email
    FROM overtime_requests o
    JOIN users u ON o.user_id = u.id
    WHERE o.status = ? ORDER BY o.created_at DESC
  `),

  getOvertimeRequestsByStatus: db?.prepare(`
    SELECT o.*, u.name as user_name
    FROM overtime_requests o
    JOIN users u ON o.user_id = u.id
    WHERE o.status = ? ORDER BY o.created_at DESC
  `),

  updateOvertimeRequestStatus: db?.prepare(`
    UPDATE overtime_requests
    SET status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `),

  // Adds vacation days when overtime is approved
  addVacationDaysFromOvertime: function(userId: string, hours: number, year: number) {
    // Convert hours to days (8 hours = 1 day)
    const daysToAdd = hours / 8;
    
    // Get current balance
    const balance = this.getUserTimeOffBalance.get(userId, year) as TimeOffBalance | undefined;
    
    if (balance) {
      // Update balance with added vacation days
      const newVacationDays = balance.vacation_days + daysToAdd;
      return this.updateTimeOffBalance.run(
        newVacationDays,
        balance.sick_days,
        balance.paid_leave,
        userId,
        year
      );
    } else {
      // Create new balance if none exists
      const balanceId = require('crypto').randomUUID();
      return this.createTimeOffBalance.run(
        balanceId,
        userId,
        daysToAdd, // Start with the overtime days
        8, // Default sick days
        0, // Default paid leave
        year
      );
    }
  }
}; 