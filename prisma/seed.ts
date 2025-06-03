const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  // Check if admin user already exists
  const existingAdmin = await prisma.user.findFirst({
    where: {
      role: 'ADMIN'
    }
  });

  if (existingAdmin) {
    console.log('Admin user already exists, skipping creation...');
    return;
  }

  // Create admin user
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD || 'Admin@123';
  const hashedPassword = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.create({
    data: {
      email: 'admin@toff.com',
      name: 'System Administrator',
      role: 'ADMIN',
      password: hashedPassword
    }
  });

  console.log('Created admin user:', {
    id: admin.id,
    email: admin.email,
    role: admin.role
  });

  // Create initial time off balances for admin
  const currentYear = new Date().getFullYear();
  const balances = [
    { type: 'VACATION', totalDays: 20, usedDays: 0 },
    { type: 'SICK', totalDays: 10, usedDays: 0 },
    { type: 'PERSONAL', totalDays: 5, usedDays: 0 }
  ];

  for (const balance of balances) {
    await prisma.timeOffBalance.create({
      data: {
        userId: admin.id,
        year: currentYear,
        type: balance.type,
        totalDays: balance.totalDays,
        usedDays: balance.usedDays,
        remainingDays: balance.totalDays - balance.usedDays
      }
    });
  }

  console.log('Created initial time off balances for admin user');

  // Log the initial setup
  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'CREATE',
      entityType: 'USER',
      entityId: admin.id,
      details: {
        type: 'INITIAL_SETUP',
        message: 'Initial admin user and balances created'
      }
    }
  });

  console.log('Initial setup completed successfully!');
  console.log('\nAdmin credentials:');
  console.log('Email:', admin.email);
  console.log('Password:', adminPassword);
  console.log('\nIMPORTANT: Please change the admin password after first login!');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 