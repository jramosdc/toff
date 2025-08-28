import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma, isPrismaEnabled } from '@/lib/db';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(process.env.VERCEL || (isPrismaEnabled && prisma))) {
    return NextResponse.json({ userEmail: process.env.EMAIL_SERVER_USER || '', hasPassword: !!process.env.EMAIL_SERVER_PASSWORD });
  }
  const row = await prisma!.emailSettings.findFirst();
  return NextResponse.json({ userEmail: row?.userEmail || '', hasPassword: !!row?.userPass });
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(process.env.VERCEL || (isPrismaEnabled && prisma))) {
    return NextResponse.json({ error: 'Settings not supported in this environment' }, { status: 400 });
  }
  try {
    const { userEmail, userPass } = await request.json();
    if (!userEmail) {
      return NextResponse.json({ error: 'userEmail is required' }, { status: 400 });
    }
    const existing = await prisma!.emailSettings.findFirst();
    if (existing) {
      await prisma!.emailSettings.update({
        where: { id: existing.id },
        data: {
          userEmail,
          ...(userPass ? { userPass } : {}),
        },
      });
    } else {
      await prisma!.emailSettings.create({ data: { userEmail, userPass: userPass || '' } });
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to save settings' }, { status: 500 });
  }
}


