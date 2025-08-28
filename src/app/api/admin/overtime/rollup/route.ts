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
    const year = Number(searchParams.get('year') || new Date().getFullYear());
    const userId = searchParams.get('userId') || undefined;

    // Prisma / Postgres
    if (process.env.VERCEL || (isPrismaEnabled && prisma)) {
      if (!prisma) return NextResponse.json([]);
      if (userId) {
        const rows = await prisma.$queryRaw<{ days: number }[]>`
          SELECT COALESCE(SUM(hours) / 8.0, 0) AS days
          FROM overtime_requests
          WHERE status = 'APPROVED' AND year = ${year} AND "userId" = ${userId}::uuid
        `;
        const days = rows[0]?.days ? Number(rows[0].days) : 0;
        return NextResponse.json({ userId, days });
      } else {
        const rows = await prisma.$queryRaw<{ userId: string; days: number }[]>`
          SELECT "userId", COALESCE(SUM(hours) / 8.0, 0) AS days
          FROM overtime_requests
          WHERE status = 'APPROVED' AND year = ${year}
          GROUP BY "userId"
        `;
        return NextResponse.json(rows);
      }
    }

    // SQLite fallback
    if (db) {
      if (userId) {
        const row = (db as any)
          .prepare('SELECT COALESCE(SUM(hours) / 8.0, 0) AS days FROM overtime_requests WHERE status = ? AND year = ? AND userId = ?')
          .get('APPROVED', year, userId) as { days: number } | undefined;
        return NextResponse.json({ userId, days: row?.days || 0 });
      } else {
        const rows = (db as any)
          .prepare('SELECT userId as userId, COALESCE(SUM(hours) / 8.0, 0) AS days FROM overtime_requests WHERE status = ? AND year = ? GROUP BY userId')
          .all('APPROVED', year) as Array<{ userId: string; days: number }>;
        return NextResponse.json(rows);
      }
    }

    return NextResponse.json([]);
  } catch (e) {
    console.error('Error fetching overtime rollup:', e);
    return NextResponse.json({ error: 'Failed to fetch overtime rollup' }, { status: 500 });
  }
}


