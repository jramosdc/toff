import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma, isPrismaEnabled } from '@/lib/db';

// Helper function to calculate working days (excluding weekends)
function calculateWorkingDays(start: Date, end: Date) {
  let count = 0;
  const current = new Date(start);

  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}

export async function GET(request: NextRequest) {
  try {
    // Verify authenticated user session
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized - You must be logged in' },
        { status: 401 }
      );
    }
    
    const userId = session.user.id;
    const year = new Date().getFullYear();
    
    // Initialize defaults
    const usedDays = {
      vacationDays: 0,
      sickDays: 0,
      paidLeave: 0
    };
    
    // Check if Prisma is available
    if (isPrismaEnabled && prisma) {
      // Get all approved time off requests for the user in the current year
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
        
        switch (request.type) {
          case 'VACATION':
            usedDays.vacationDays += daysUsed;
            break;
          case 'SICK':
            usedDays.sickDays += daysUsed;
            break;
          case 'PAID_LEAVE':
            usedDays.paidLeave += daysUsed;
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