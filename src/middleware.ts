import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl;
    const idToken = request.cookies.get('fb-id-token');
    
    console.log('🔵 MIDDLEWARE: Path:', pathname);
    console.log('🔵 MIDDLEWARE: Cookie exists:', !!idToken);
    console.log('🔵 MIDDLEWARE: All cookies:', request.cookies.getAll().map(c => c.name).join(', '));
    
    // Check if user has a token
    if (!idToken) {
      console.log('🔵 MIDDLEWARE: No token, redirecting to login');
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('error', 'You must be logged in to access this page.');
      return NextResponse.redirect(loginUrl);
    }
    
    console.log('🔵 MIDDLEWARE: Token found, allowing access');
    return NextResponse.next();
  } catch (error) {
    console.error('Middleware error:', error);
    return NextResponse.next();
  }
}

export const config = {
  matcher: ['/dashboard/:path*', '/driver-dashboard/:path*'],
};
