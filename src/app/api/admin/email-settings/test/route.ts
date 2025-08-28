import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma, isPrismaEnabled } from '@/lib/db';
import nodemailer from 'nodemailer';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    let userEmail = process.env.EMAIL_SERVER_USER;
    let userPass = process.env.EMAIL_SERVER_PASSWORD;
    if (process.env.VERCEL || (isPrismaEnabled && prisma)) {
      const row = await prisma!.emailSettings.findFirst();
      if (row?.userEmail) userEmail = row.userEmail;
      if (row?.userPass) userPass = row.userPass;
    }
    if (!userEmail || !userPass) {
      return NextResponse.json({ error: 'Email credentials not configured' }, { status: 400 });
    }
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_SERVER_HOST,
      port: process.env.EMAIL_SERVER_PORT ? parseInt(process.env.EMAIL_SERVER_PORT) : 587,
      secure: false,
      auth: { user: userEmail, pass: userPass },
    });
    const to = session.user.email || userEmail;
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || userEmail,
      to,
      subject: 'TOFF Test Email',
      html: '<p>This is a test email from TOFF settings.</p>',
    });
    return NextResponse.json({ success: true, messageId: info.messageId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to send test email' }, { status: 500 });
  }
}


