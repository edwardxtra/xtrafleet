import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Server-side authentication middleware
 * 
 * Protects dashboard routes by verifying Firebase ID tokens before allowing access.
 * This prevents bypassing client-side auth by direct URL access or disabled JavaScript.
 * 
 * NOTE: This runs in Edge Runtime, so we can't use Firebase Admin SDK here.
 * Instead, we just check for the presence of a token and let the dashboard pages
 * do the full verification. This is still better than no server-side check at all.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Get the Firebase ID token from cookies
  const token = request.cookies.get('fb-id-token');
  
  // No token = not authenticated
  if (!token || !token.value) {
    console.log(`[Auth] No token found for ${pathname}, redirecting to login`);
    return NextResponse.redirect(new URL('/login', request.url));
  }
  
  // Token exists - allow access
  // Note: Full token verification happens in the dashboard pages/API routes
  // using Firebase Admin SDK, which can't run in Edge Runtime
  console.log(`[Auth] Token present for ${pathname}, allowing access`);
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/driver-dashboard/:path*',
  ],
};
