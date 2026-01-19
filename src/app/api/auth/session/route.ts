import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase-admin-singleton';
import { handleApiError, handleApiSuccess } from '@/lib/api-error-handler';
import { withCors } from '@/lib/api-cors';

/**
 * Session duration: 7 days
 * After this, users need to log in again
 */
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Create a session cookie from Firebase ID token
 */
async function handlePost(request: NextRequest) {
  try {
    const { token } = await request.json();
    
    if (!token) {
      // No token = delete cookie (logout)
      const response = handleApiSuccess({ success: true });
      response.cookies.delete('fb-id-token');
      return response;
    }
    
    // Verify the token is valid
    const { auth } = await getFirebaseAdmin();
    const decodedToken = await auth.verifyIdToken(token);
    
    console.log('[Session] Token verified for user:', decodedToken.uid);
    
    // Create session cookie with expiration
    const sessionCookie = await auth.createSessionCookie(token, {
      expiresIn: SESSION_DURATION_MS,
    });
    
    // Create response with cookie
    const response = handleApiSuccess({ 
      success: true,
      expiresIn: SESSION_DURATION_MS,
    });
    
    // Set secure cookie
    response.cookies.set('fb-id-token', sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_DURATION_MS / 1000, // Convert to seconds
    });
    
    console.log('[Session] Cookie set successfully, expires in 7 days');
    
    return response;
  } catch (error) {
    return handleApiError(
      'auth',
      error instanceof Error ? error : new Error(String(error)),
      { endpoint: 'POST /api/auth/session' }
    );
  }
}

/**
 * Delete session cookie (logout)
 */
async function handleDelete(request: NextRequest) {
  try {
    console.log('[Session] DELETE - removing cookie');
    const response = handleApiSuccess({ success: true });
    response.cookies.delete('fb-id-token');
    return response;
  } catch (error) {
    return handleApiError(
      'server',
      error instanceof Error ? error : new Error(String(error)),
      { endpoint: 'DELETE /api/auth/session' }
    );
  }
}

// Export with CORS protection
export const POST = withCors(handlePost);
export const DELETE = withCors(handleDelete);
