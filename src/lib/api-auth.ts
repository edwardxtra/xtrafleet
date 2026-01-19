/**
 * Authentication Helper for API Routes
 * 
 * CRITICAL: All API routes MUST use this helper for authentication.
 * This ensures consistent token verification across the entire app.
 * 
 * ✅ CORRECT USAGE:
 * import { authenticateRequest } from '@/lib/api-auth';
 * const user = await authenticateRequest(req);
 * 
 * ❌ NEVER DO THIS:
 * const token = req.cookies.get('fb-id-token');
 * await auth.verifyIdToken(token.value); // This breaks with session cookies!
 */

import { NextRequest } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase-admin-singleton';

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  [key: string]: any;
}

/**
 * Authenticate a request by verifying the Firebase token
 * 
 * Handles both:
 * - Session cookies (issuer: session.firebase.google.com) - most common
 * - Regular ID tokens (issuer: securetoken.google.com) - fallback
 * 
 * @throws Error with message 'Unauthorized' if authentication fails
 * @returns Decoded token with user information
 */
export async function authenticateRequest(req: NextRequest): Promise<AuthenticatedUser> {
  const { auth } = await getFirebaseAdmin();
  
  // Get token from cookie
  const token = req.cookies.get('fb-id-token');
  if (!token) {
    throw new Error('Unauthorized');
  }

  // Try session cookie first (most common for logged-in users)
  try {
    return await auth.verifySessionCookie(token.value, true);
  } catch (sessionError) {
    // If that fails, try regular ID token
    try {
      return await auth.verifyIdToken(token.value);
    } catch (idTokenError) {
      throw new Error('Unauthorized');
    }
  }
}

/**
 * Optional: Authenticate with custom error messages
 */
export async function authenticateRequestWithError(
  req: NextRequest,
  customError?: string
): Promise<AuthenticatedUser> {
  try {
    return await authenticateRequest(req);
  } catch (error) {
    throw new Error(customError || 'Unauthorized');
  }
}
