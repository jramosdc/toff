import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { dbOperations } from '@/lib/db';
import { authOptions } from '@/lib/auth';

export async function PATCH(
  request: Request,
  { params }: { params: { requestId: string } }
) {
  const session = await getServerSession(authOptions);
  
  console.log('Session user in request update:', session?.user); // Debug log
  
  const userRole = session?.user?.role;

  if (!session?.user || userRole !== 'ADMIN') {
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
    });
  }

  const data = await request.json();
  const { status } = data;

  if (!['APPROVED', 'REJECTED'].includes(status)) {
    return new NextResponse(JSON.stringify({ error: 'Invalid status' }), {
      status: 400,
    });
  }

  dbOperations.updateTimeOffRequestStatus.run(status, params.requestId);

  return new NextResponse(JSON.stringify({ success: true }));
} 