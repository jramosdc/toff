const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

// Connect to the database
const db = new Database(path.join(process.cwd(), 'toff.db'), { verbose: console.log });

// Drop existing tables if they exist
db.exec(`
  DROP TABLE IF EXISTS overtime_requests;
  DROP TABLE IF EXISTS time_off_requests;
  DROP TABLE IF EXISTS time_off_balance;
  DROP TABLE IF EXISTS verification_tokens;
  DROP TABLE IF EXISTS accounts;
  DROP TABLE IF EXISTS users;
`);

// Initialize the database schema
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

  CREATE TABLE IF NOT EXISTS verification_tokens (
    identifier TEXT NOT NULL,
    token TEXT NOT NULL,
    expires DATETIME NOT NULL,
    PRIMARY KEY (identifier, token)
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    provider_account_id TEXT NOT NULL,
    refresh_token TEXT,
    access_token TEXT,
    expires_at INTEGER,
    token_type TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

console.log('Database initialized successfully');

// Create admin user
const adminId = randomUUID();
const adminPassword = bcrypt.hashSync('admin', 10);

db.prepare(`
  INSERT INTO users (id, email, name, password, role)
  VALUES (?, ?, ?, ?, ?)
`).run(adminId, 'admin@example.com', 'Admin User', adminPassword, 'ADMIN');

// Create test users
const createTestUser = (email, name, role = 'EMPLOYEE') => {
  const id = randomUUID();
  const password = bcrypt.hashSync('password', 10);
  
  db.prepare(`
    INSERT INTO users (id, email, name, password, role)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, email, name, password, role);
  
  return id;
};

const user1Id = createTestUser('john@example.com', 'John Doe');
const user2Id = createTestUser('jane@example.com', 'Jane Smith');
const user3Id = createTestUser('bob@example.com', 'Bob Johnson');
const user4Id = createTestUser('alice@example.com', 'Alice Williams');
const user5Id = createTestUser('manager@example.com', 'Michael Manager', 'MANAGER');

// Create time off balances for all users
const createTimeOffBalance = (userId, year, vacationDays, sickDays, paidLeave) => {
  const id = randomUUID();
  
  db.prepare(`
    INSERT INTO time_off_balance (id, user_id, year, vacation_days, sick_days, paid_leave)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, userId, year, vacationDays, sickDays, paidLeave);
};

const currentYear = new Date().getFullYear();

// Admin balance
createTimeOffBalance(adminId, currentYear, 25, 10, 5);

// Employee balances
createTimeOffBalance(user1Id, currentYear, 22, 8, 3);
createTimeOffBalance(user2Id, currentYear, 22, 8, 2);
createTimeOffBalance(user3Id, currentYear, 22, 8, 0);
createTimeOffBalance(user4Id, currentYear, 22, 8, 1);
createTimeOffBalance(user5Id, currentYear, 25, 10, 5);

console.log('Sample data created successfully.');

db.close(); 