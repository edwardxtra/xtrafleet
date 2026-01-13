import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// TEMPORARY: Stubbed out to fix build errors
// TODO: Restore full webhook implementation after fixing firebase-admin build issue

export async function POST(request: NextRequest) {
  return NextResponse.json({ 
    error: 'Webhook temporarily disabled during build fix',
    status: 'pending_implementation' 
  }, { status: 503 });
}
