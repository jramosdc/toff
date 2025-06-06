#!/usr/bin/env node

/**
 * Production Data Migration Script
 * 
 * This script migrates existing employee data from the old structure
 * to the new PostgreSQL + Prisma structure, preserving all:
 * - Users (employees and admins)
 * - Balance data (vacation, sick, paid leave, personal days)
 * - Time-off requests (with history and statuses)
 * - Overtime requests
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

// Use the toff directory Prisma client
const prisma = new PrismaClient({
  log: ['info', 'warn', 'error'],
});

// Helper function to read CSV files
function readCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    const fullPath = path.join(__dirname, '..', 'toff', 'data-backup', filePath);
    
    if (!fs.existsSync(fullPath)) {
      console.log(`⚠️  CSV file not found: ${fullPath}`);
      resolve([]);
      return;
    }

    fs.createReadStream(fullPath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => {
        console.log(`✅ Read ${results.length} records from ${filePath}`);
        resolve(results);
      })
      .on('error', reject);
  });
}

// Convert role string to enum value
function convertRole(roleString) {
  const role = roleString?.toUpperCase();
  if (role === 'ADMIN') return 'ADMIN';
  if (role === 'MANAGER') return 'MANAGER';
  return 'EMPLOYEE'; // Default to EMPLOYEE
}

// Migrate users
async function migrateUsers() {
  console.log('\n🔄 Migrating users...');
  
  const users = await readCSV('users.csv');
  
  for (const user of users) {
    try {
      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: user.email }
      });

      if (existingUser) {
        console.log(`⏭️  User already exists: ${user.email}`);
        continue;
      }

      // Create user with correct role enum
      await prisma.user.create({
        data: {
          id: user.id,
          email: user.email,
          name: user.name,
          password: user.password, // Keep encrypted password
          role: convertRole(user.role),
          createdAt: new Date(user.created_at),
          updatedAt: new Date(user.updated_at)
        }
      });

      console.log(`✅ Migrated user: ${user.name} (${user.email}) - ${convertRole(user.role)}`);
    } catch (error) {
      console.error(`❌ Failed to migrate user ${user.email}:`, error.message);
    }
  }
}

// Migrate balance data (convert from unified to type-based structure)
async function migrateBalances() {
  console.log('\n🔄 Migrating balance data...');
  
  const balances = await readCSV('time_off_balance.csv');
  
  for (const balance of balances) {
    try {
      // Check if user exists
      const user = await prisma.user.findUnique({
        where: { id: balance.user_id }
      });

      if (!user) {
        console.log(`⚠️  User not found for balance: ${balance.user_id}`);
        continue;
      }

      // Create individual balance records for each type
      const balanceTypes = [
        { type: 'VACATION', remainingDays: parseInt(balance.vacation_days) || 0 },
        { type: 'SICK', remainingDays: parseInt(balance.sick_days) || 0 },
        { type: 'PAID_LEAVE', remainingDays: parseInt(balance.paid_leave) || 0 },
        { type: 'PERSONAL', remainingDays: parseInt(balance.personal_days) || 0 }
      ];

      for (const balanceType of balanceTypes) {
        // Check if balance already exists
        const existingBalance = await prisma.timeOffBalance.findFirst({
          where: {
            userId: balance.user_id,
            year: parseInt(balance.year),
            type: balanceType.type
          }
        });

        if (existingBalance) {
          console.log(`⏭️  Balance already exists: ${user.name} - ${balanceType.type}`);
          continue;
        }

        // Create new balance record
        await prisma.timeOffBalance.create({
          data: {
            userId: balance.user_id,
            year: parseInt(balance.year),
            type: balanceType.type,
            totalDays: balanceType.remainingDays, // Assume current remaining = total
            usedDays: 0, // Will be recalculated based on approved requests
            remainingDays: balanceType.remainingDays,
            createdAt: new Date(balance.created_at),
            updatedAt: new Date(balance.updated_at)
          }
        });

        console.log(`✅ Created ${balanceType.type} balance for ${user.name}: ${balanceType.remainingDays} days`);
      }
    } catch (error) {
      console.error(`❌ Failed to migrate balance for user ${balance.user_id}:`, error.message);
    }
  }
}

// Migrate time-off requests
async function migrateTimeOffRequests() {
  console.log('\n🔄 Migrating time-off requests...');
  
  const requests = await readCSV('time_off_requests.csv');
  
  for (const request of requests) {
    try {
      // Check if user exists
      const user = await prisma.user.findUnique({
        where: { id: request.user_id }
      });

      if (!user) {
        console.log(`⚠️  User not found for request: ${request.user_id}`);
        continue;
      }

      // Check if request already exists
      const existingRequest = await prisma.timeOffRequest.findUnique({
        where: { id: request.id }
      });

      if (existingRequest) {
        console.log(`⏭️  Request already exists: ${request.id}`);
        continue;
      }

      // Create time-off request
      await prisma.timeOffRequest.create({
        data: {
          id: request.id,
          userId: request.user_id,
          startDate: new Date(request.start_date),
          endDate: new Date(request.end_date),
          type: request.type,
          status: request.status,
          reason: request.reason || '',
          createdAt: new Date(request.created_at),
          updatedAt: new Date(request.updated_at)
        }
      });

      console.log(`✅ Migrated ${request.type} request for ${user.name}: ${request.start_date} to ${request.end_date} (${request.status})`);
    } catch (error) {
      console.error(`❌ Failed to migrate request ${request.id}:`, error.message);
    }
  }
}

// Migrate overtime requests
async function migrateOvertimeRequests() {
  console.log('\n🔄 Migrating overtime requests...');
  
  const requests = await readCSV('overtime_requests.csv');
  
  if (requests.length === 0) {
    console.log('ℹ️  No overtime requests to migrate');
    return;
  }
  
  for (const request of requests) {
    try {
      // Check if user exists
      const user = await prisma.user.findUnique({
        where: { id: request.user_id }
      });

      if (!user) {
        console.log(`⚠️  User not found for overtime request: ${request.user_id}`);
        continue;
      }

      // Check if request already exists (only if overtimeRequest model exists)
      try {
        const existingRequest = await prisma.overtimeRequest.findUnique({
          where: { id: request.id }
        });

        if (existingRequest) {
          console.log(`⏭️  Overtime request already exists: ${request.id}`);
          continue;
        }

        // Create overtime request
        await prisma.overtimeRequest.create({
          data: {
            id: request.id,
            userId: request.user_id,
            hours: parseFloat(request.hours),
            requestDate: new Date(request.request_date),
            month: parseInt(request.month),
            year: parseInt(request.year),
            status: request.status,
            notes: request.notes || '',
            createdAt: new Date(request.created_at),
            updatedAt: new Date(request.updated_at)
          }
        });

        console.log(`✅ Migrated overtime request for ${user.name}: ${request.hours} hours (${request.status})`);
      } catch (modelError) {
        console.log(`ℹ️  Overtime model not available, skipping overtime requests`);
        break;
      }
    } catch (error) {
      console.error(`❌ Failed to migrate overtime request ${request.id}:`, error.message);
    }
  }
}

// Recalculate used days based on approved requests
async function recalculateUsedDays() {
  console.log('\n🔄 Recalculating used days based on approved requests...');
  
  const approvedRequests = await prisma.timeOffRequest.findMany({
    where: { status: 'APPROVED' },
    include: { user: true }
  });

  for (const request of approvedRequests) {
    try {
      // Calculate working days between start and end date
      const startDate = new Date(request.startDate);
      const endDate = new Date(request.endDate);
      let workingDays = 0;
      
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        // Skip weekends (0 = Sunday, 6 = Saturday)
        if (d.getDay() !== 0 && d.getDay() !== 6) {
          workingDays++;
        }
      }

      // Update the corresponding balance
      const balance = await prisma.timeOffBalance.findFirst({
        where: {
          userId: request.userId,
          year: startDate.getFullYear(),
          type: request.type
        }
      });

      if (balance) {
        const newUsedDays = balance.usedDays + workingDays;
        const newRemainingDays = balance.totalDays - newUsedDays;

        await prisma.timeOffBalance.update({
          where: { id: balance.id },
          data: {
            usedDays: newUsedDays,
            remainingDays: Math.max(0, newRemainingDays) // Don't go negative
          }
        });

        console.log(`✅ Updated ${request.type} balance for ${request.user.name}: used ${workingDays} days`);
      }
    } catch (error) {
      console.error(`❌ Failed to recalculate for request ${request.id}:`, error.message);
    }
  }
}

// Main migration function
async function runMigration() {
  console.log('🚀 Starting Production Data Migration...');
  console.log('===============================================');
  
  try {
    // Test database connection
    await prisma.$connect();
    console.log('✅ Database connection established');

    // Run migrations in order
    await migrateUsers();
    await migrateBalances();
    await migrateTimeOffRequests();
    await migrateOvertimeRequests();
    await recalculateUsedDays();

    console.log('\n🎉 Migration completed successfully!');
    console.log('===============================================');
    
    // Show summary
    const userCount = await prisma.user.count();
    const balanceCount = await prisma.timeOffBalance.count();
    const requestCount = await prisma.timeOffRequest.count();
    
    console.log(`📊 Migration Summary:`);
    console.log(`   Users: ${userCount}`);
    console.log(`   Balance Records: ${balanceCount}`);
    console.log(`   Time-off Requests: ${requestCount}`);
    
    // Try to count overtime requests if model exists
    try {
      const overtimeCount = await prisma.overtimeRequest.count();
      console.log(`   Overtime Requests: ${overtimeCount}`);
    } catch (e) {
      console.log(`   Overtime Requests: Not available (model not found)`);
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Handle command line execution
if (require.main === module) {
  // Add CSV parser dependency check
  try {
    require('csv-parser');
  } catch (e) {
    console.error('❌ Missing dependency: csv-parser');
    console.log('📦 Please install it: npm install csv-parser');
    process.exit(1);
  }

  runMigration()
    .catch(console.error);
}

module.exports = { runMigration }; 