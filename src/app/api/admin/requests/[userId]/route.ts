import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db from '@/lib/db';

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
  } catch (error) {
    console.error('Error fetching user requests:', error);
    return NextResponse.json({ error: 'Failed to fetch user requests' }, { status: 500 });
  }
} 