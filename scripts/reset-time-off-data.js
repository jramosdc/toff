require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');

// Get the database URL from environment variable or command line argument
const databaseUrl = process.argv[2] || process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('ERROR: No DATABASE_URL provided. Please specify as an environment variable or command line argument.');
  console.error('Usage: node reset-time-off-data.js "postgresql://username:password@host:port/database"');
  process.exit(1);
}

console.log(`Using database: ${databaseUrl.replace(/\/\/.*?@/, '//***:***@')}`); // Hide credentials in logs

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
});

async function main() {
  console.log('Starting to reset time off request data...');

  try {
    // Delete all overtime requests
    console.log('Deleting overtime requests...');
    const deletedOvertimeRequests = await prisma.overtimeRequest.deleteMany({});
    console.log(`Deleted ${deletedOvertimeRequests.count} overtime requests`);

    // Delete all time off requests
    console.log('Deleting time off requests...');
    const deletedTimeOffRequests = await prisma.timeOffRequest.deleteMany({});
    console.log(`Deleted ${deletedTimeOffRequests.count} time off requests`);

    console.log('✅ Database reset completed successfully!');
    console.log('All time off and overtime requests have been removed.');
    console.log('User accounts and time off balances remain intact.');
  } catch (error) {
    console.error('Error during reset:', error);
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error('Error during reset:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 