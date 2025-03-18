import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get('date') || '2025-03-18';
  
  try {
    const date = new Date(dateStr);
    
    return NextResponse.json({
      original: dateStr,
      parsed: date.toISOString(),
      valid: !isNaN(date.getTime()),
      formatted: date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    });
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to parse date',
      original: dateStr
    }, { status: 400 });
  }
} 