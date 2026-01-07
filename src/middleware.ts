import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // Cookie-based auth doesn't work reliably with Firebase Hosting + Cloud Run
  // Auth protection is handled client-side in the layout components
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/driver-dashboard/:path*'],
};
