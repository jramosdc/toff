import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db, { prisma, isPrismaEnabled } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: { userId: string } }
) {
  const session = await getServerSession(authOptions);
  const userId = params.userId;

  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString());
    
    console.log("Fetching requests for userId:", userId, "year:", year);
    console.log("DATABASE_URL:", process.env.DATABASE_URL);
    console.log("isPrismaEnabled:", isPrismaEnabled);
    console.log("Prisma client available:", !!prisma);
    console.log("VERCEL:", process.env.VERCEL);
    
    // Use Prisma in production
    if (process.env.VERCEL || (isPrismaEnabled && prisma)) {
      console.log("Using Prisma to fetch user time off requests");
      
      const requests = await prisma?.timeOffRequest.findMany({
        where: {
          userId: userId,
          OR: [
            {
              startDate: {
                gte: new Date(`${year}-01-01`),
                lte: new Date(`${year}-12-31`),
              },
            },
            {
              endDate: {
                gte: new Date(`${year}-01-01`),
                lte: new Date(`${year}-12-31`),
              },
            },
          ],
        },
        orderBy: {
          startDate: 'desc',
        },
      });
      
      // Transform the response to match the expected format
      const formattedRequests = requests?.map(req => ({
        id: req.id,
        user_id: req.userId,
        start_date: req.startDate.toISOString(),
        end_date: req.endDate.toISOString(),
        type: req.type,
        status: req.status,
        reason: req.reason
      }));
      
      return NextResponse.json(formattedRequests);
      
    } else if (db) {
      console.log("Using SQLite to fetch user time off requests");
      // Create a custom query to get all requests for the user for the specified year
      const requests = db.prepare(`
        SELECT * FROM time_off_requests 
        WHERE user_id = ? 
        AND (
          (strftime('%Y', start_date) = ? OR strftime('%Y', end_date) = ?)
        )
        ORDER BY start_date DESC
      `).all(userId, year.toString(), year.toString());

      return NextResponse.json(requests);
    } else {
      throw new Error("No database connection available");
    }
  } catch (error) {
    console.error('Error fetching user requests:', error);
    return NextResponse.json({ error: `Failed to fetch user requests: ${error}` }, { status: 500 });
  }
} 