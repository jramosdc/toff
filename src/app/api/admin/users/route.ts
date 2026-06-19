import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db, { dbOperations, prisma, isPrismaEnabled } from '@/lib/db';
import { 
  StandardUser, 
  UsersResponse, 
  ApiErrorResponse 
} from '@/lib/types/api-interfaces';
import { 
  transformUserToApi, 
  transformUsersToApi,
  DatabaseUser 
} from '@/lib/utils/api-transformers';
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

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      const errorResponse: ApiErrorResponse = {
        error: 'Unauthorized'
      };
      return NextResponse.json(errorResponse, { status: 401 });
    }

    if (session.user.role !== 'ADMIN') {
      const errorResponse: ApiErrorResponse = {
        error: 'Forbidden: Admin access required',
        code: 'INSUFFICIENT_PERMISSIONS'
      };
      return NextResponse.json(errorResponse, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()));

    let users: any[] = []; // Using any to accommodate the extended structure

    // Use production/Prisma first (Vercel environment)
    if (process.env.VERCEL || (isPrismaEnabled && prisma)) {
      console.log("Fetching users using Prisma");
      
      const prismaUsers = await prisma?.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          supervisorId: true,
          supervisor: {
            select: { id: true, name: true }
          },
          createdAt: true,
          updatedAt: true,
          timeOffBalances: {
            where: { year }
          }
        },
        orderBy: {
          name: 'asc'
        }
      });

      if (prismaUsers) {
        // Transform Prisma results to standard format with balances
        users = prismaUsers.map(user => {
          const balanceMap = {
            vacationDays: 0,
            sickDays: 0,
            paidLeave: 0,
            personalDays: 0
          };
          const usedMap = {
            vacationDays: 0,
            sickDays: 0,
            paidLeave: 0,
            personalDays: 0
          };

          user.timeOffBalances.forEach(b => {
            const type = b.type as 'VACATION' | 'SICK' | 'PAID_LEAVE' | 'PERSONAL';
            const key = type === 'VACATION' ? 'vacationDays' :
                       type === 'SICK' ? 'sickDays' :
                       type === 'PAID_LEAVE' ? 'paidLeave' : 'personalDays';
            
            balanceMap[key] = b.remainingDays;
            usedMap[key] = b.usedDays;
          });

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role as 'ADMIN' | 'EMPLOYEE',
            supervisorId: user.supervisorId,
            supervisorName: user.supervisor?.name,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
            balance: balanceMap,
            usedDays: usedMap
          };
        });
      }
    }
    
    // Fallback to SQLite (development)
    else if (db && dbOperations) {
      console.log("Fetching users using SQLite");
      
      const dbUsers = dbOperations.getAllUsers() as DatabaseUser[];
      
      if (dbUsers) {
        // Transform SQLite results to standard format
        users = transformUsersToApi(dbUsers);
      }
    }
    
    else {
      throw new Error("No database connection available");
    }

    // Return standardized response
    const response: UsersResponse = {
      users,
      total: users.length
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching users:', error);
    
    const errorResponse: ApiErrorResponse = {
      error: 'Failed to fetch users',
      code: 'DATABASE_ERROR',
      details: process.env.NODE_ENV === 'development' ? { error: String(error) } : undefined
    };
    
    return NextResponse.json(errorResponse, { status: 500 });
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
          timeOffBalances: {
            create: [
              {
                id: randomUUID(),
                year: currentYear,
                type: 'VACATION',
                totalDays: 22,
                usedDays: 0,
                remainingDays: 22
              },
              {
                id: randomUUID(),
                year: currentYear,
                type: 'SICK',
                totalDays: 8,
                usedDays: 0,
                remainingDays: 8
              },
              {
                id: randomUUID(),
                year: currentYear,
                type: 'PERSONAL',
                totalDays: 5,
                usedDays: 0,
                remainingDays: 5
              }
            ]
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