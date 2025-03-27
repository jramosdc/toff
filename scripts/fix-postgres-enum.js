// Script to manually add the PERSONAL enum value to the TimeOffType enum
// This uses the Prisma client to execute raw SQL directly

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixTimeOffTypeEnum() {
  console.log('Starting PostgreSQL enum fix...');
  
  try {
    // Check if the enum type exists
    const checkTypeResult = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'timeofftype'
      ) as exists_flag;
    `;
    
    const typeExists = checkTypeResult[0].exists_flag;
    
    if (!typeExists) {
      console.log('TimeOffType enum does not exist yet. No fix needed.');
      return;
    }
    
    // Check if the PERSONAL value already exists in the enum
    const checkEnumResult = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'PERSONAL' 
        AND enumtypid = (
          SELECT oid FROM pg_type WHERE typname = 'timeofftype'
        )
      ) as exists_flag;
    `;
    
    const enumValueExists = checkEnumResult[0].exists_flag;
    
    if (enumValueExists) {
      console.log('PERSONAL value already exists in TimeOffType enum. No fix needed.');
      return;
    }
    
    // Add the PERSONAL value to the enum
    console.log('Adding PERSONAL value to TimeOffType enum...');
    await prisma.$executeRawUnsafe(`ALTER TYPE "TimeOffType" ADD VALUE 'PERSONAL'`);
    
    console.log('Successfully added PERSONAL to TimeOffType enum.');
  } catch (error) {
    console.error('Error fixing TimeOffType enum:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the function
fixTimeOffTypeEnum()
  .then(() => console.log('Enum fix completed.'))
  .catch(e => {
    console.error('Failed to fix enum:', e);
    process.exit(1);
  }); 