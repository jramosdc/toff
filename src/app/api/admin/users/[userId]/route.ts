import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db, { dbOperations, prisma, isPrismaEnabled } from '@/lib/db';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export async function GET(
  request: Request,
  { params }: { params: { userId: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = params.userId;
  
  try {
    console.log("Getting user details for userId:", userId);
    console.log("DATABASE_URL:", process.env.DATABASE_URL);
    console.log("isPrismaEnabled:", isPrismaEnabled);
    console.log("Prisma client available:", !!prisma);
    
    let user;
    
    // Use Prisma in production
    if (process.env.VERCEL || (isPrismaEnabled && prisma)) {
      console.log("Using Prisma to fetch user details");
      user = await prisma?.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true
        }
      });
    } else if (db && dbOperations.getUserById) {
      console.log("Using SQLite to fetch user details");
      user = dbOperations.getUserById.get(userId) as User | undefined;
    } else {
      throw new Error("No database connection available");
    }
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json({ error: `Failed to fetch user: ${error}` }, { status: 500 });
  }
} 