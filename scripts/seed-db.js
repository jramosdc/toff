require('dotenv').config({ path: '.env.production.local' });
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

// Initialize Prisma client
const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seeding...');

  // Clear existing data (optional - remove if you want to keep existing data)
  console.log('Clearing existing data...');
  await prisma.timeOffRequest.deleteMany({});
  await prisma.timeOffBalance.deleteMany({});
  await prisma.user.deleteMany({});

  console.log('Creating admin user...');
  // Create admin user with environment variables
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD || 'jmejia';
  const adminEmail = process.env.ADMIN_EMAIL || 'jmejia@efe.com';
  const adminName = process.env.ADMIN_NAME || 'Jairo Mejia';
  const adminPasswordHash = await bcrypt.hash(adminPassword, 10);
  
  const admin = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: adminEmail,
      name: adminName,
      password: adminPasswordHash,
      role: 'ADMIN',
    }
  });
  console.log(`Admin created: ${admin.name} (${admin.email})`);

  // List of employees
  const employees = [
    { name: 'Albert Traver', email: 'atraver@efe.com' },
    { name: 'Alberto David Boal Santos', email: 'aboal@efe.com' },
    { name: 'Alejandra Arredondo', email: 'aarredondo@efe.com' },
    { name: 'Alicia Sanchez Gomez', email: 'asanchezg@efe.com' },
    { name: 'Ana Milena Varon', email: 'amilena@efe.com' },
    { name: 'Andrés Sánchez Braun', email: 'asanchezb@efe.com' },
    { name: 'Angel Colmenares', email: 'acolmenares@efe.com' },
    { name: 'Beatriz Pascual Macías', email: 'bpascual@efe.com' },
    { name: 'Eduard Ribas I Admetlla', email: 'eribas@efe.com' },
    { name: 'Guillermo Azábal', email: 'gazabal@efe.com' },
    { name: 'Latif Al kanchidi Kassidi', email: 'aalkanchidi@efe.com' },
    { name: 'Marta Garde Ricote', email: 'mgarde@efe.com' },
    { name: 'Mikaela Viqueira', email: 'mviqueira@efe.com' },
    { name: 'Monica Rubalcava Loredo', email: 'mrubalcava@efe.com' },
    { name: 'Nora Quintanilla', email: 'nquintanilla@efe.com' },
    { name: 'Octavio Guzmán', email: 'oguzman@efe.com' },
    { name: 'Ruth Hernandez', email: 'rhernandez@efe.com' },
    { name: 'Sarah Yáñez-Richards', email: 'syanez@efe.com' }
  ];

  console.log('Creating employee accounts...');
  // Create employee users with time off balances
  const currentYear = new Date().getFullYear();
  
  for (const employee of employees) {
    // Extract password from email (part before @)
    const passwordPlain = employee.email.split('@')[0];
    const passwordHash = await bcrypt.hash(passwordPlain, 10);
    
    // Create user
    const user = await prisma.user.create({
      data: {
        id: randomUUID(),
        email: employee.email,
        name: employee.name,
        password: passwordHash,
        role: 'EMPLOYEE',
      }
    });
    
    // Create time off balance for current year
    await prisma.timeOffBalance.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        vacationDays: 22,  // Default vacation days
        sickDays: 8,       // Default sick days
        paidLeave: 0,      // Default paid leave
        year: currentYear
      }
    });
    
    console.log(`Created employee: ${user.name} (${user.email})`);
  }

  // Also create time off balance for admin
  await prisma.timeOffBalance.create({
    data: {
      id: randomUUID(),
      userId: admin.id,
      vacationDays: 25,
      sickDays: 10,
      paidLeave: 5,
      year: currentYear
    }
  });

  console.log('Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 