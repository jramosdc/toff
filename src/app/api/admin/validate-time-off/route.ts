import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import db, { prisma, isPrismaEnabled } from '@/lib/db';
import { calculateWorkingDays } from '@/lib/date-utils';

interface ValidationResult {
  userId: string;
  userName: string;
  issues: {
    type: 'OVERLAP' | 'CALCULATION_MISMATCH' | 'INVALID_RANGE';
    message: string;
    requestId?: string;
    details?: any;
  }[];
}

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role !== 'ADMIN') {
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
    });
  }

  try {
    let requests;
    let users;
    
    if (process.env.VERCEL || isPrismaEnabled) {
      // Get all approved time off requests with Prisma
      requests = await prisma?.timeOffRequest.findMany({
        where: { status: 'APPROVED' },
        include: { user: true },
        orderBy: { startDate: 'asc' }
      });
      
      // Get all users with Prisma
      users = await prisma?.user.findMany();
    } else if (db) {
      // Get all approved time off requests with SQLite
      const stmt = db.prepare(`
        SELECT t.*, u.name as user_name, u.email as user_email
        FROM time_off_requests t
        JOIN users u ON t.user_id = u.id
        WHERE t.status = 'APPROVED'
        ORDER BY t.start_date ASC
      `);
      requests = stmt.all();
      
      // Get all users with SQLite
      users = db.prepare('SELECT * FROM users').all();
    } else {
      throw new Error("No database connection available");
    }

    const validationResults: ValidationResult[] = [];
    
    // Group requests by user
    const requestsByUser = new Map<string, any[]>();
    requests?.forEach(request => {
      const userId = process.env.VERCEL || isPrismaEnabled 
        ? request.userId 
        : request.user_id;
      
      if (!requestsByUser.has(userId)) {
        requestsByUser.set(userId, []);
      }
      requestsByUser.get(userId)?.push(request);
    });

    // Validate each user's requests
    for (const [userId, userRequests] of requestsByUser) {
      const user = users?.find(u => 
        (process.env.VERCEL || isPrismaEnabled ? u.id : u.id) === userId
      );
      
      if (!user) continue;

      const issues: ValidationResult['issues'] = [];
      
      // Sort requests by start date
      userRequests.sort((a, b) => {
        const startA = new Date(process.env.VERCEL || isPrismaEnabled ? a.startDate : a.start_date);
        const startB = new Date(process.env.VERCEL || isPrismaEnabled ? b.startDate : b.start_date);
        return startA.getTime() - startB.getTime();
      });

      // Check for overlapping requests
      for (let i = 0; i < userRequests.length - 1; i++) {
        const current = userRequests[i];
        const next = userRequests[i + 1];
        
        const currentEnd = new Date(process.env.VERCEL || isPrismaEnabled ? current.endDate : current.end_date);
        const nextStart = new Date(process.env.VERCEL || isPrismaEnabled ? next.startDate : next.start_date);
        
        if (currentEnd >= nextStart) {
          issues.push({
            type: 'OVERLAP',
            message: `Overlapping time off requests found`,
            requestId: process.env.VERCEL || isPrismaEnabled ? current.id : current.id,
            details: {
              currentRequest: {
                start: process.env.VERCEL || isPrismaEnabled ? current.startDate : current.start_date,
                end: process.env.VERCEL || isPrismaEnabled ? current.endDate : current.end_date,
                type: current.type
              },
              nextRequest: {
                start: process.env.VERCEL || isPrismaEnabled ? next.startDate : next.start_date,
                end: process.env.VERCEL || isPrismaEnabled ? next.endDate : next.end_date,
                type: next.type
              }
            }
          });
        }
      }

      // Check working days calculation
      for (const request of userRequests) {
        const startDate = new Date(process.env.VERCEL || isPrismaEnabled ? request.startDate : request.start_date);
        const endDate = new Date(process.env.VERCEL || isPrismaEnabled ? request.endDate : request.end_date);
        
        // Set time components for accurate calculation
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        
        const calculatedDays = calculateWorkingDays(startDate, endDate);
        const storedDays = process.env.VERCEL || isPrismaEnabled 
          ? request.workingDays 
          : request.working_days;
        
        if (calculatedDays !== storedDays) {
          issues.push({
            type: 'CALCULATION_MISMATCH',
            message: `Working days calculation mismatch`,
            requestId: process.env.VERCEL || isPrismaEnabled ? request.id : request.id,
            details: {
              calculated: calculatedDays,
              stored: storedDays,
              start: process.env.VERCEL || isPrismaEnabled ? request.startDate : request.start_date,
              end: process.env.VERCEL || isPrismaEnabled ? request.endDate : request.end_date
            }
          });
        }
      }

      if (issues.length > 0) {
        validationResults.push({
          userId,
          userName: process.env.VERCEL || isPrismaEnabled ? user.name : user.name,
          issues
        });
      }
    }

    return NextResponse.json({
      totalUsers: users?.length || 0,
      totalRequests: requests?.length || 0,
      usersWithIssues: validationResults.length,
      validationResults
    });
  } catch (error) {
    console.error("Error validating time off requests:", error);
    return NextResponse.json({ error: `Error validating time off requests: ${error}` }, { status: 500 });
  }
} 