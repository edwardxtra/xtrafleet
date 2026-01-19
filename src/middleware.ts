import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Server-side authentication middleware
 * 
 * Protects dashboard routes by verifying Firebase ID tokens before allowing access.
 * This prevents bypassing client-side auth by direct URL access or disabled JavaScript.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Get the Firebase ID token from cookies
  const token = request.cookies.get('fb-id-token');
  
  // No token = not authenticated
  if (!token) {
    console.log(`[Auth] No token found for ${pathname}, redirecting to login`);
    return NextResponse.redirect(new URL('/login', request.url));
  }
  
  // Verify the token with Firebase Admin
  try {
    // Import Firebase Admin dynamically to avoid edge runtime issues
    const { getFirebaseAdmin } = await import('@/lib/firebase-admin-singleton');
    const { auth } = await getFirebaseAdmin();
    
    // Verify the ID token
    const decodedToken = await auth.verifyIdToken(token.value);
    
    // Token is valid - allow access
    console.log(`[Auth] Valid token for user ${decodedToken.uid}, allowing access to ${pathname}`);
    
    // Add user info to headers for downstream use (optional)
    const response = NextResponse.next();
    response.headers.set('x-user-id', decodedToken.uid);
    response.headers.set('x-user-email', decodedToken.email || '');
    
    return response;
  } catch (error) {
    // Token is invalid or expired
    console.error(`[Auth] Token verification failed for ${pathname}:`, error);
    
    // Clear the invalid cookie
    const response = NextResponse.redirect(new URL('/login?error=session-expired', request.url));
    response.cookies.delete('fb-id-token');
    
    return response;
  }
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/driver-dashboard/:path*',
  ],
};
