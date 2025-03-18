import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import db, { dbOperations, prisma, isPrismaEnabled } from '@/lib/db';
import { randomUUID } from 'crypto';
import { authOptions } from '@/lib/auth';

interface TimeOffBalance {
  id: string;
  userId: string;
  vacationDays: number;
  sickDays: number;
  paidLeave: number;
  year: number;
}

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
    });
  }

  console.log('Session user:', session.user); // Debug log
  console.log("DATABASE_URL:", process.env.DATABASE_URL);
  console.log("isPrismaEnabled:", isPrismaEnabled);
  console.log("Prisma client available:", !!prisma);

  const currentYear = new Date().getFullYear();
  const userId = session.user.id;
  const userEmail = session.user.email;
  
  if (!userId && !userEmail) {
    return new NextResponse(JSON.stringify({ error: 'User ID or email not found in session' }), {
      status: 400,
    });
  }

  let balance;
  let userIdToUse = userId;
  
  // Use Prisma in production
  if (process.env.VERCEL || (isPrismaEnabled && prisma)) {
    console.log("Using Prisma to get time off balance");
    
    // First try to look up user by email if we don't have a valid userId
    if (userEmail && (!userIdToUse || userIdToUse.length < 5)) {
      console.log("Looking up user by email:", userEmail);
      const user = await prisma?.user.findUnique({
        where: { email: userEmail }
      });
      
      if (user) {
        console.log("Found user by email, using userId:", user.id);
        userIdToUse = user.id;
      }
    }
    
    if (!userIdToUse) {
      return new NextResponse(JSON.stringify({ error: 'Could not determine user ID' }), {
        status: 400,
      });
    }
    
    // Fetch balance
    balance = await prisma?.timeOffBalance.findFirst({
      where: {
        userId: userIdToUse,
        year: currentYear
      }
    });
    
    // Create initial balance if none found
    if (!balance) {
      console.log("Creating initial balance with Prisma for user:", userIdToUse);
      
      balance = await prisma?.timeOffBalance.create({
        data: {
          id: randomUUID(),
          userId: userIdToUse,
          vacationDays: 22,
          sickDays: 8,
          paidLeave: 0,
          year: currentYear
        }
      });
    }
    
  } else if (db) {
    // Use SQLite in development
    console.log("Using SQLite to get time off balance");
    balance = dbOperations.getTimeOffBalance?.get(userIdToUse, currentYear) as TimeOffBalance | undefined;

    if (!balance) {
      // Create initial balance for new users
      const initialBalance: TimeOffBalance = {
        id: randomUUID(),
        userId: userIdToUse,
        vacationDays: 22,
        sickDays: 8,
        paidLeave: 0,
        year: currentYear,
      };

      console.log('Creating initial balance with SQLite:', initialBalance);

      dbOperations.createTimeOffBalance?.run(
        initialBalance.id,
        initialBalance.userId,
        initialBalance.vacationDays,
        initialBalance.sickDays,
        initialBalance.paidLeave,
        initialBalance.year
      );

      balance = initialBalance;
    }
  } else {
    return new NextResponse(JSON.stringify({ error: 'No database connection available' }), {
      status: 500,
    });
  }

  return new NextResponse(JSON.stringify(balance));
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Admin check for updating other users' balances
  const isAdmin = session.user.role === 'ADMIN';
  
  try {
    const data = await request.json();
    const { userId, vacationDays, sickDays, paidLeave } = data;
    
    console.log("Updating balance with data:", data);
    
    // If not admin, can only update own balance
    if (!isAdmin && userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized to update other users' }, { status: 403 });
    }
    
    const currentYear = new Date().getFullYear();
    let userIdToUse = userId;
    
    // Validate inputs
    if (vacationDays < 0 || sickDays < 0 || paidLeave < 0) {
      return NextResponse.json({ error: 'Days cannot be negative' }, { status: 400 });
    }
    
    // If userId is missing, use the session user's ID
    if (!userIdToUse) {
      userIdToUse = session.user.id;
    }
    
    if (!userIdToUse) {
      return NextResponse.json({ error: 'User ID not provided' }, { status: 400 });
    }
    
    // Use Prisma in production
    if (process.env.VERCEL || (isPrismaEnabled && prisma)) {
      console.log("Using Prisma to update time off balance");
      
      // Check if user exists
      const user = await prisma?.user.findUnique({
        where: { id: userIdToUse }
      });
      
      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      
      // Check if balance exists
      let balance = await prisma?.timeOffBalance.findFirst({
        where: {
          userId: userIdToUse,
          year: currentYear
        }
      });
      
      if (balance) {
        // Update existing balance
        balance = await prisma?.timeOffBalance.update({
          where: { id: balance.id },
          data: {
            vacationDays: vacationDays !== undefined ? vacationDays : balance.vacationDays,
            sickDays: sickDays !== undefined ? sickDays : balance.sickDays,
            paidLeave: paidLeave !== undefined ? paidLeave : balance.paidLeave
          }
        });
      } else {
        // Create new balance
        balance = await prisma?.timeOffBalance.create({
          data: {
            id: randomUUID(),
            userId: userIdToUse,
            vacationDays: vacationDays || 22,
            sickDays: sickDays || 8,
            paidLeave: paidLeave || 0,
            year: currentYear
          }
        });
      }
      
      return NextResponse.json(balance);
      
    } else if (db) {
      // Use SQLite in development
      console.log("Using SQLite to update time off balance");
      
      // Check if balance exists
      const balance = dbOperations.getTimeOffBalance?.get(userIdToUse, currentYear);
      
      if (balance) {
        // Update existing balance
        dbOperations.updateTimeOffBalance?.run(
          vacationDays !== undefined ? vacationDays : balance.vacationDays,
          sickDays !== undefined ? sickDays : balance.sickDays,
          paidLeave !== undefined ? paidLeave : balance.paidLeave,
          userIdToUse,
          currentYear
        );
      } else {
        // Create new balance
        const balanceId = randomUUID();
        dbOperations.createTimeOffBalance?.run(
          balanceId,
          userIdToUse,
          vacationDays || 22,
          sickDays || 8,
          paidLeave || 0,
          currentYear
        );
      }
      
      // Get updated balance
      const updatedBalance = dbOperations.getTimeOffBalance?.get(userIdToUse, currentYear);
      return NextResponse.json(updatedBalance);
    } else {
      return NextResponse.json({ error: 'No database connection available' }, { status: 500 });
    }
    
  } catch (error) {
    console.error("Error updating time off balance:", error);
    return NextResponse.json({ error: `Failed to update time off balance: ${error}` }, { status: 500 });
  }
} 