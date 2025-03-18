import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db from '@/lib/db';

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString());
    const status = searchParams.get('status') || null;
    
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
    
    query += ` ORDER BY r.start_date DESC`;
    
    const requests = db.prepare(query).all(...params);
    
    return NextResponse.json(requests);
  } catch (error) {
    console.error('Error fetching requests:', error);
    return NextResponse.json(
      { error: 'Failed to fetch time off requests' }, 
      { status: 500 }
    );
  }
} 