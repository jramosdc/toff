import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db, { prisma, isPrismaEnabled } from '@/lib/db';

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || undefined;
    const limit = Number(searchParams.get('limit') || '10');

    if (process.env.VERCEL || (isPrismaEnabled && prisma)) {
      const logs = await prisma!.auditLog.findMany({
        where: {
          ...(userId ? { userId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 100),
      });
      return NextResponse.json(logs);
    }

    if (db) {
      let rows: any[] = [];
      if (userId) {
        rows = (db as any)
          .prepare('SELECT * FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
          .all(userId, Math.min(limit, 100));
      } else {
        rows = (db as any)
          .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?')
          .all(Math.min(limit, 100));
      }
      return NextResponse.json(rows);
    }

    return NextResponse.json({ error: 'No database connection available' }, { status: 500 });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 });
  }
}


