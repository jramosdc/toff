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
          role: true,
          supervisorId: true,
          supervisor: {
            select: { id: true, name: true }
          }
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
      role: user.role,
      supervisorId: (user as any).supervisorId,
      supervisorName: (user as any).supervisor?.name
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json({ error: `Failed to fetch user: ${error}` }, { status: 500 });
  }
} 

export async function PUT(
  request: Request,
  { params }: { params: { userId: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = params.userId;

  try {
    const data = await request.json();
    const { name, email, role, supervisorId } = data;

    if (process.env.VERCEL || (isPrismaEnabled && prisma)) {
      // Check if user exists
      const existingUser = await prisma!.user.findUnique({ where: { id: userId } });
      if (!existingUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      // Update user
      const updatedUser = await prisma!.user.update({
        where: { id: userId },
        data: {
          name,
          email,
          role,
          supervisorId: supervisorId || null, // Handle removal of supervisor
        },
      });

      return NextResponse.json(updatedUser);
    } 
    
    // SQLite fallback not fully implemented for supervisor relation
    return NextResponse.json({ error: 'Database not supported for this operation in current environment' }, { status: 501 });

  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { userId: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = params.userId;

  // Prevent self-delete
  if (session.user.id === userId) {
    return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 });
  }

  try {
    if (process.env.VERCEL || (isPrismaEnabled && prisma)) {
      // Hard delete with cascade (schema uses onDelete: Cascade)
      await prisma!.user.delete({ where: { id: userId } });
      return NextResponse.json({ success: true });
    }

    if (db && (dbOperations as any)?.getUserById) {
      // SQLite fallback: manual cascade deletes if necessary
      (db as any).prepare('DELETE FROM time_off_requests WHERE userId = ?').run(userId);
      (db as any).prepare('DELETE FROM time_off_balance WHERE userId = ?').run(userId);
      (db as any).prepare('DELETE FROM overtime_requests WHERE userId = ?').run(userId);
      (db as any).prepare('DELETE FROM users WHERE id = ?').run(userId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'No database connection available' }, { status: 500 });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json({ error: `Failed to delete user: ${error}` }, { status: 500 });
  }
} 