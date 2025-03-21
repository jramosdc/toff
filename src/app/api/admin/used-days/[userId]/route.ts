import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma, isPrismaEnabled } from '@/lib/db';
import { calculateWorkingDays } from '@/lib/date-utils';

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
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
    
    const { userId } = params;
    const year = parseInt(request.nextUrl.searchParams.get('year') || new Date().getFullYear().toString());
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }
    
    // Initialize defaults
    const usedDays = {
      vacationDays: 0,
      sickDays: 0,
      paidLeave: 0,
      personalDays: 0
    };
    
    // Check if Prisma is available
    if (isPrismaEnabled && prisma) {
      // Get all approved time off requests for the user in the specified year
      const startOfYear = new Date(year, 0, 1);
      const endOfYear = new Date(year, 11, 31, 23, 59, 59);
      
      const approvedRequests = await prisma.timeOffRequest.findMany({
        where: {
          userId: userId,
          status: 'APPROVED',
          startDate: {
            gte: startOfYear
          },
          endDate: {
            lte: endOfYear
          }
        }
      });
      
      // Calculate used days for each type
      for (const request of approvedRequests) {
        const daysUsed = calculateWorkingDays(
          new Date(request.startDate), 
          new Date(request.endDate)
        );
        
        // Use string comparison instead of enum to avoid type errors
        const typeString = request.type.toString();
        
        switch (typeString) {
          case 'VACATION':
            usedDays.vacationDays += daysUsed;
            break;
          case 'SICK':
            usedDays.sickDays += daysUsed;
            break;
          case 'PAID_LEAVE':
            usedDays.paidLeave += daysUsed;
            break;
          case 'PERSONAL':
            usedDays.personalDays += daysUsed;
            break;
        }
      }
    } else {
      // For non-Prisma environments, we'll return default values
      // Ideally, this would implement SQLite queries as fallback
      console.warn('Prisma not available for used days calculation');
    }
    
    return NextResponse.json(usedDays);
    
  } catch (error: unknown) {
    console.error('Error calculating used days:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to calculate used days', details: errorMessage },
      { status: 500 }
    );
  }
} 