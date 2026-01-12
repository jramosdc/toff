import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db, { prisma, isPrismaEnabled } from '@/lib/db';

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user || !['ADMIN', 'MANAGER'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString());
    const status = searchParams.get('status') || null;
    const userId = searchParams.get('userId');
    
    // Use Prisma in production
    if (process.env.VERCEL || (isPrismaEnabled && prisma)) {
      console.log("Using Prisma to fetch time off requests");
      
      const whereClause: any = {
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
      };
      
      if (status) {
        whereClause.status = status;
      }
      
      if (userId) {
        whereClause.userId = userId;
      }

      // If user is a MANAGER (and not ADMIN), only show requests from their subordinates
      if (session.user.role === 'MANAGER') {
        whereClause.user = {
          supervisorId: session.user.id
        };
      }
      
      const requests = await prisma?.timeOffRequest.findMany({
        where: whereClause,
        include: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
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
        reason: req.reason,
        working_days: req.workingDays,
        user_name: req.user.name,
        user_email: req.user.email
      }));
      
      return NextResponse.json(formattedRequests);
      
    } else if (db) {
      console.log("Using SQLite to fetch time off requests");
      // Use SQLite in development
      let query = `
        SELECT r.*, u.name as user_name, u.email as user_email 
        FROM time_off_requests r
        JOIN users u ON r.user_id = u.id
        WHERE (strftime('%Y', r.start_date) = ? OR strftime('%Y', r.end_date) = ?)
      `;
      
      const params = [year.toString(), year.toString()];
      
      if (status) {
        query += ` AND r.status = ?`;
        params.push(status);
      }
      
      if (userId) {
        query += ` AND r.user_id = ?`;
        params.push(userId);
      }
      
      query += ` ORDER BY r.start_date DESC`;
      
      const requests = db.prepare(query).all(...params);
      
      return NextResponse.json(requests);
    } else {
      throw new Error("No database connection available");
    }
  } catch (error) {
    console.error('Error fetching requests:', error);
    return NextResponse.json(
      { error: `Failed to fetch time off requests: ${error}` }, 
      { status: 500 }
    );
  }
} 