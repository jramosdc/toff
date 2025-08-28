import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma, isPrismaEnabled } from '@/lib/db';
import { authOptions } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    // Verify authenticated admin session
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized - You must be logged in' },
        { status: 401 }
      );
    }
    
    if (session.user?.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }
    
    // Env gate: disallow in production unless explicitly allowed
    if (process.env.VERCEL && process.env.ALLOW_DB_RESET !== 'true') {
      return NextResponse.json(
        { error: 'Reset disabled in this environment' },
        { status: 403 }
      );
    }

    // Check if Prisma is available
    if (!isPrismaEnabled || !prisma) {
      return NextResponse.json(
        { error: 'Database configuration error - Prisma is not available' },
        { status: 500 }
      );
    }
    
    // Parse request body
    const body = await req.json();
    const { confirmReset, phrase } = body;
    
    if (confirmReset !== true || phrase !== 'DELETE toff') {
      return NextResponse.json(
        { error: 'Reset not confirmed. Provide confirmReset=true and phrase="DELETE toff"' },
        { status: 400 }
      );
    }
    
    // Results storage
    const results = {
      timeOffRequests: 0,
      overtimeRequests: 0
    };
    
    // Delete all time off requests - using the mapped table name
    const deletedTimeOffRequests = await prisma.timeOffRequest.deleteMany({});
    results.timeOffRequests = deletedTimeOffRequests.count;
    
    // Handle overtime requests
    // Since the OvertimeRequest model might not be in the schema directly, 
    // use a more dynamic approach with prisma.$executeRawUnsafe
    try {
      // Try to use the direct model if available
      // @ts-ignore - Ignore TypeScript error since model may not be defined in schema
      const overtimeResult = await prisma.overtimeRequest?.deleteMany({});
      if (overtimeResult) {
        results.overtimeRequests = overtimeResult.count;
      }
    } catch (err) {
      // Fallback to raw SQL if model is not available
      try {
        const rawResult = await prisma.$executeRawUnsafe(
          `DELETE FROM "overtime_requests" WHERE TRUE`
        );
        results.overtimeRequests = typeof rawResult === 'number' ? rawResult : 0;
      } catch (sqlError) {
        console.warn('Could not delete overtime requests:', sqlError);
        // Don't fail the whole operation if this part fails
      }
    }
    
    return NextResponse.json({
      success: true,
      message: 'Time off and overtime request data has been reset',
      details: {
        deletedTimeOffRequests: results.timeOffRequests,
        deletedOvertimeRequests: results.overtimeRequests
      }
    });
    
  } catch (error: unknown) {
    console.error('Error resetting data:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to reset data', details: errorMessage },
      { status: 500 }
    );
  }
} 