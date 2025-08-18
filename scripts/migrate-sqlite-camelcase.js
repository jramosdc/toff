/*
 Migration: SQLite snake_case → camelCase column names (lossless)
 - Creates a timestamped backup of toff.db
 - For each affected table, creates a new table with camelCase schema
   and copies data from old table, then swaps tables
 - Wrapped in a single transaction; will rollback on any error
*/

/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { randomUUID } = require('crypto');

const dbPath = path.join(process.cwd(), 'toff.db');

function tableHasColumn(db, table, column) {
  try {
    const stmt = db.prepare(`PRAGMA table_info(${table})`);
    const cols = stmt.all();
    return cols.some((c) => c.name === column);
  } catch (e) {
    return false;
  }
}

function tableExists(db, table) {
  const stmt = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`
  );
  const row = stmt.get(table);
  return !!row;
}

function migrateUsers(db) {
  if (!tableExists(db, 'users')) return;
  // Only migrate if old columns are present
  if (!tableHasColumn(db, 'users', 'created_at') && !tableHasColumn(db, 'users', 'updated_at')) return;

  console.log('Migrating table: users');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users_new (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT,
      role TEXT DEFAULT 'EMPLOYEE',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO users_new (id, name, email, password, role, createdAt, updatedAt)
    SELECT id, name, email, password, role, created_at, updated_at FROM users;
    DROP TABLE users;
    ALTER TABLE users_new RENAME TO users;
  `);
}

function migrateTimeOffBalance(db) {
  if (!tableExists(db, 'time_off_balance')) return;
  const hasSnakeUser = tableHasColumn(db, 'time_off_balance', 'user_id');
  const hasSnakeTotals = tableHasColumn(db, 'time_off_balance', 'total_days');
  const hasType = tableHasColumn(db, 'time_off_balance', 'type');

  console.log('Migrating table: time_off_balance');
  // Create target table
  db.exec(`
    CREATE TABLE IF NOT EXISTS time_off_balance_new (
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
  `);

  if (hasType && hasSnakeUser && hasSnakeTotals) {
    // Simple snake_case -> camelCase copy
    db.exec(`
      INSERT INTO time_off_balance_new (id, userId, year, type, totalDays, usedDays, remainingDays, createdAt, updatedAt)
      SELECT id, user_id, year, type, total_days, used_days, remaining_days, created_at, updated_at FROM time_off_balance;
    `);
  } else {
    // Legacy aggregated schema: expand to typed rows
    // Try to detect columns
    const legacyCols = db.prepare("PRAGMA table_info(time_off_balance)").all();
    const colNames = new Set(legacyCols.map(c => c.name));

    const hasVacation = colNames.has('vacationDays') || colNames.has('vacation_days');
    const hasSick = colNames.has('sickDays') || colNames.has('sick_days');
    const hasPaid = colNames.has('paidLeave') || colNames.has('paid_leave');
    const hasPersonal = colNames.has('personalDays') || colNames.has('personal_days');

    // Build SELECT to cover variants
    const selectSql = `
      SELECT 
        id,
        ${colNames.has('userId') ? 'userId' : (colNames.has('user_id') ? 'user_id' : 'userId')} as userId,
        year,
        ${hasVacation ? (colNames.has('vacationDays') ? 'vacationDays' : 'vacation_days') : 'NULL'} as vacationDays,
        ${hasSick ? (colNames.has('sickDays') ? 'sickDays' : 'sick_days') : 'NULL'} as sickDays,
        ${hasPaid ? (colNames.has('paidLeave') ? 'paidLeave' : 'paid_leave') : 'NULL'} as paidLeave,
        ${hasPersonal ? (colNames.has('personalDays') ? 'personalDays' : 'personal_days') : 'NULL'} as personalDays,
        ${colNames.has('createdAt') ? 'createdAt' : (colNames.has('created_at') ? 'created_at' : 'CURRENT_TIMESTAMP')} as createdAt,
        ${colNames.has('updatedAt') ? 'updatedAt' : (colNames.has('updated_at') ? 'updated_at' : 'CURRENT_TIMESTAMP')} as updatedAt
      FROM time_off_balance`;

    const rows = db.prepare(selectSql).all();
    const insert = db.prepare(`
      INSERT INTO time_off_balance_new (id, userId, year, type, totalDays, usedDays, remainingDays, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const r of rows) {
      const types = [
        { key: 'VACATION', value: r.vacationDays },
        { key: 'SICK', value: r.sickDays },
        { key: 'PAID_LEAVE', value: r.paidLeave },
        { key: 'PERSONAL', value: r.personalDays },
      ];
      for (const t of types) {
        const total = typeof t.value === 'number' ? t.value : (t.value ? Number(t.value) : 0);
        if (total == null || isNaN(total)) continue;
        const id = randomUUID();
        const used = 0;
        const remaining = total - used;
        insert.run(id, r.userId, r.year, t.key, total, used, remaining, r.createdAt, r.updatedAt);
      }
    }
  }

  db.exec(`
    DROP TABLE time_off_balance;
    ALTER TABLE time_off_balance_new RENAME TO time_off_balance;
  `);
}

function migrateTimeOffRequests(db) {
  if (!tableExists(db, 'time_off_requests')) return;

  console.log('Migrating table: time_off_requests');
  // Create target table
  db.exec(`
    CREATE TABLE IF NOT EXISTS time_off_requests_new (
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
  `);

  const cols = db.prepare('PRAGMA table_info(time_off_requests)').all();
  const names = new Set(cols.map(c => c.name));

  const hasSnakeUser = names.has('user_id');
  const hasCamelUser = names.has('userId');
  const hasSnakeStart = names.has('start_date');
  const hasCamelStart = names.has('startDate');
  const hasSnakeEnd = names.has('end_date');
  const hasCamelEnd = names.has('endDate');
  const hasWorkingDays = names.has('working_days') || names.has('workingDays');
  const hasReason = names.has('reason');
  const hasType = names.has('type');
  const hasStatus = names.has('status');
  const createdCol = names.has('createdAt') ? 'createdAt' : (names.has('created_at') ? 'created_at' : null);
  const updatedCol = names.has('updatedAt') ? 'updatedAt' : (names.has('updated_at') ? 'updated_at' : null);

  // Fetch rows with available columns
  const selectFields = [
    'id',
    hasCamelUser ? 'userId' : (hasSnakeUser ? 'user_id' : 'userId') + ' as userId',
    hasType ? 'type' : `'VACATION' as type`,
    hasCamelStart ? 'startDate' : (hasSnakeStart ? 'start_date as startDate' : 'startDate'),
    hasCamelEnd ? 'endDate' : (hasSnakeEnd ? 'end_date as endDate' : 'endDate'),
    hasWorkingDays ? (names.has('workingDays') ? 'workingDays' : 'working_days as workingDays') : 'NULL as workingDays',
    hasStatus ? 'status' : `'PENDING' as status`,
    hasReason ? 'reason' : 'NULL as reason',
    createdCol ? `${createdCol} as createdAt` : 'CURRENT_TIMESTAMP as createdAt',
    updatedCol ? `${updatedCol} as updatedAt` : 'CURRENT_TIMESTAMP as updatedAt'
  ];

  const selectSql = `SELECT ${selectFields.join(', ')} FROM time_off_requests`;
  const rows = db.prepare(selectSql).all();

  // Working days calculator (weekdays only, inclusive)
  function computeWorkingDays(startStr, endStr) {
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (!(start instanceof Date) || isNaN(start) || !(end instanceof Date) || isNaN(end)) return 0;
    let count = 0;
    const cur = new Date(start);
    cur.setHours(0,0,0,0);
    end.setHours(23,59,59,999);
    while (cur <= end) {
      const d = cur.getDay();
      if (d !== 0 && d !== 6) count++;
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  }

  const insert = db.prepare(`
    INSERT INTO time_off_requests_new (id, userId, type, startDate, endDate, workingDays, status, reason, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const r of rows) {
    const working = (r.workingDays == null) ? computeWorkingDays(r.startDate, r.endDate) : Number(r.workingDays);
    insert.run(r.id, r.userId, r.type, r.startDate, r.endDate, working, r.status, r.reason, r.createdAt, r.updatedAt);
  }

  db.exec(`
    DROP TABLE time_off_requests;
    ALTER TABLE time_off_requests_new RENAME TO time_off_requests;
  `);
}

function migrateOvertimeRequests(db) {
  if (!tableExists(db, 'overtime_requests')) return;
  if (!tableHasColumn(db, 'overtime_requests', 'user_id') && !tableHasColumn(db, 'overtime_requests', 'request_date')) return;

  console.log('Migrating table: overtime_requests');
  db.exec(`
    CREATE TABLE IF NOT EXISTS overtime_requests_new (
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
    INSERT INTO overtime_requests_new (id, userId, hours, requestDate, month, year, status, notes, createdAt, updatedAt)
    SELECT id, user_id, hours, request_date, month, year, status, notes, created_at, updated_at FROM overtime_requests;
    DROP TABLE overtime_requests;
    ALTER TABLE overtime_requests_new RENAME TO overtime_requests;
  `);
}

function migrateAuditLogs(db) {
  if (!tableExists(db, 'audit_logs')) return;
  if (!tableHasColumn(db, 'audit_logs', 'user_id') && !tableHasColumn(db, 'audit_logs', 'entity_type')) return;

  console.log('Migrating table: audit_logs');
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs_new (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      action TEXT NOT NULL,
      entityType TEXT NOT NULL,
      entityId TEXT NOT NULL,
      details TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id)
    );
    INSERT INTO audit_logs_new (id, userId, action, entityType, entityId, details, createdAt)
    SELECT id, user_id, action, entity_type, entity_id, details, created_at FROM audit_logs;
    DROP TABLE audit_logs;
    ALTER TABLE audit_logs_new RENAME TO audit_logs;
  `);
}

function main() {
  if (!fs.existsSync(dbPath)) {
    console.error(`SQLite database not found at ${dbPath}`);
    process.exit(1);
  }

  // Backup
  const backupPath = path.join(
    process.cwd(),
    `toff.backup.${new Date().toISOString().replace(/[:.]/g, '-')}.db`
  );
  fs.copyFileSync(dbPath, backupPath);
  console.log(`Backup created: ${backupPath}`);

  const db = new Database(dbPath);
  try {
    // Disable FK checks during table swap operations
    db.pragma('foreign_keys = OFF');
    db.exec('BEGIN');

    migrateUsers(db);
    migrateTimeOffBalance(db);
    migrateTimeOffRequests(db);
    migrateOvertimeRequests(db);
    migrateAuditLogs(db);

    db.exec('COMMIT');
    // Re-enable FK checks and validate
    db.pragma('foreign_keys = ON');
    try {
      const fkIssues = db.prepare('PRAGMA foreign_key_check').all();
      if (fkIssues && fkIssues.length > 0) {
        console.warn('Foreign key issues detected after migration:', fkIssues);
      }
    } catch {}
    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed, rolling back...', err);
    try { db.exec('ROLLBACK'); } catch {}
    try { db.pragma('foreign_keys = ON'); } catch {}
    process.exit(1);
  } finally {
    db.close();
  }
}

main();


