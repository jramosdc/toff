import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { dbOperations } from '@/lib/db';
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
    const users = dbOperations.getAllUsers.all();
    return NextResponse.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
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

    // Check if user already exists
    const existingUser = dbOperations.getUserByEmail.get(email);
    if (existingUser) {
      return NextResponse.json({ error: 'User with this email already exists' }, { status: 409 });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Generate user ID
    const userId = randomUUID();

    // Create user
    dbOperations.createUser.run(
      userId,
      email,
      name,
      hashedPassword,
      role || 'EMPLOYEE'
    );
    
    // Get the created user
    const newUser = dbOperations.getUserById.get(userId) as User;

    // Create default time off balance for the current year
    const currentYear = new Date().getFullYear();
    const balanceId = randomUUID();
    
    dbOperations.createTimeOffBalance.run(
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
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
} 