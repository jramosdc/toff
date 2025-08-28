import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma, isPrismaEnabled } from '@/lib/db';

async function ensureTable() {
  try {
    await (prisma as any).emailSettings?.findFirst?.({ where: { id: '00000000-0000-0000-0000-000000000000' } });
  } catch (e: any) {
    const msg = e?.message || '';
    if (msg.includes('does not exist')) {
      await prisma!.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "EmailSettings" (
          id uuid PRIMARY KEY,
          "userEmail" text NOT NULL,
          "userPass" text NOT NULL,
          "updatedAt" timestamptz NOT NULL DEFAULT now(),
          "createdAt" timestamptz NOT NULL DEFAULT now()
        )
      `);
    }
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(process.env.VERCEL || (isPrismaEnabled && prisma))) {
    return NextResponse.json({ userEmail: process.env.EMAIL_SERVER_USER || '', hasPassword: !!process.env.EMAIL_SERVER_PASSWORD });
  }
  await ensureTable();
  const row = await (prisma as any).emailSettings.findFirst();
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
    await ensureTable();
    const { userEmail, userPass } = await request.json();
    if (!userEmail) {
      return NextResponse.json({ error: 'userEmail is required' }, { status: 400 });
    }
    const existing = await (prisma as any).emailSettings.findFirst();
    if (existing) {
      await (prisma as any).emailSettings.update({
        where: { id: existing.id },
        data: {
          userEmail,
          ...(userPass ? { userPass } : {}),
        },
      });
    } else {
      // generate id in app
      const id = crypto.randomUUID();
      await prisma!.$executeRawUnsafe(
        `INSERT INTO "EmailSettings" (id, "userEmail", "userPass") VALUES ($1::uuid, $2, $3)`,
        id,
        userEmail,
        userPass || ''
      );
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to save settings' }, { status: 500 });
  }
}


