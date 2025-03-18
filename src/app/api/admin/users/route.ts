import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db, { dbOperations, prisma, isPrismaEnabled } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

// Define user type
interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  password: string;
  created_at?: string;
  updated_at?: string;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log("DATABASE_URL:", process.env.DATABASE_URL);
    console.log("isPrismaEnabled:", isPrismaEnabled);
    console.log("Prisma client available:", !!prisma);
    
    let users = [];
    
    // Use Prisma in production
    if (process.env.VERCEL || (isPrismaEnabled && prisma)) {
      console.log("Using Prisma to fetch users");
      users = await prisma?.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          updatedAt: true
        }
      }) || [];
    } else if (db && dbOperations.getAllUsers) {
      console.log("Using SQLite to fetch users");
      users = dbOperations.getAllUsers.all();
    } else {
      throw new Error("No database connection available");
    }
    
    return NextResponse.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: `Failed to fetch users: ${error}` }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { name, email, password, role } = await request.json();

    // Validate input
    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Name, email, and password are required' }, { status: 400 });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Generate user ID
    const userId = randomUUID();
    const currentYear = new Date().getFullYear();
    
    // Use Prisma in production
    if (process.env.VERCEL || (isPrismaEnabled && prisma)) {
      console.log("Using Prisma to create user");
      
      // Check if user already exists
      const existingUser = await prisma?.user.findUnique({
        where: { email }
      });
      
      if (existingUser) {
        return NextResponse.json({ error: 'User with this email already exists' }, { status: 409 });
      }
      
      // Create user with Prisma
      const newUser = await prisma?.user.create({
        data: {
          id: userId,
          email,
          name,
          password: hashedPassword,
          role: role || 'EMPLOYEE',
          timeOffBalance: {
            create: {
              id: randomUUID(),
              vacationDays: 22,
              sickDays: 8,
              paidLeave: 0,
              year: currentYear
            }
          }
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true
        }
      });
      
      return NextResponse.json(newUser, { status: 201 });
    } else if (db) {
      // Using SQLite in development
      console.log("Using SQLite to create user");
      
      // Check if user already exists
      const existingUser = dbOperations.getUserByEmail?.get(email);
      
      if (existingUser) {
        return NextResponse.json({ error: 'User with this email already exists' }, { status: 409 });
      }
      
      // Create user
      dbOperations.createUser?.run(
        userId,
        email,
        name,
        hashedPassword,
        role || 'EMPLOYEE'
      );
      
      // Get the created user
      const newUser = dbOperations.getUserById?.get(userId) as User;
      
      // Create default time off balance for the current year
      const balanceId = randomUUID();
      
      dbOperations.createTimeOffBalance?.run(
        balanceId,
        userId,
        22, // vacationDays
        8,  // sickDays
        0,  // paidLeave
        currentYear
      );
      
      return NextResponse.json({ 
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role
      }, { status: 201 });
    } else {
      throw new Error("No database connection available");
    }
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json({ error: `Failed to create user: ${error}` }, { status: 500 });
  }
} 