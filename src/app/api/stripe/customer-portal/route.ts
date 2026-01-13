import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// TEMPORARY: Stubbed out to fix build errors
export async function POST(request: NextRequest) {
  return NextResponse.json({ 
    error: 'Customer portal temporarily disabled during build fix' 
  }, { status: 503 });
}
