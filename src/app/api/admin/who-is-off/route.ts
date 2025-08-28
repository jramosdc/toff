import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma, isPrismaEnabled } from '@/lib/db';

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get('date') || new Date().toISOString().split('T')[0];
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
    }

    if (!(process.env.VERCEL || (isPrismaEnabled && prisma))) {
      return NextResponse.json([]);
    }

    // Find approved requests that include the given calendar day
    const start = new Date(dateStr + 'T00:00:00.000Z');
    const end = new Date(dateStr + 'T23:59:59.999Z');

    const rows = await prisma!.timeOffRequest.findMany({
      where: {
        status: 'APPROVED',
        startDate: { lte: end },
        endDate: { gte: start },
      },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { startDate: 'asc' },
    });

    const result = rows.map(r => ({
      userId: r.userId,
      name: (r as any).user?.name,
      email: (r as any).user?.email,
      type: r.type,
      startDate: r.startDate,
      endDate: r.endDate,
    }));

    return NextResponse.json(result);
  } catch (e) {
    console.error('Error in who-is-off:', e);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}


