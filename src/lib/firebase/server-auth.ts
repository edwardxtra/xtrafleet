import { cookies } from 'next/headers';
import admin from 'firebase-admin';
import type { DecodedIdToken, App } from 'firebase-admin/auth';

/**
 * Initialize Firebase Admin SDK with comprehensive error handling.
 * Returns null if initialization fails - callers MUST check this.
 */
export async function initializeFirebaseAdmin(): Promise<App | null> {
  // Return existing app if already initialized
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const privateKey = process.env.FB_PRIVATE_KEY?.replace(/\\n/g, '\n');

  // CRITICAL: Detailed logging of environment variables
  if (!process.env.FB_PROJECT_ID || !process.env.FB_CLIENT_EMAIL || !privateKey) {
    console.error('╔══════════════════════════════════════════════════════════════╗');
    console.error('║ CRITICAL ERROR: Firebase Admin SDK Cannot Initialize        ║');
    console.error('╠══════════════════════════════════════════════════════════════╣');
    console.error('║ Missing Required Environment Variables:                      ║');
    console.error(`║ FB_PROJECT_ID:    ${process.env.FB_PROJECT_ID ? '✓ SET' : '✗ MISSING'}                                   ║`);
    console.error(`║ FB_CLIENT_EMAIL:  ${process.env.FB_CLIENT_EMAIL ? '✓ SET' : '✗ MISSING'}                                   ║`);
    console.error(`║ FB_PRIVATE_KEY:   ${privateKey ? '✓ SET' : '✗ MISSING'}                                   ║`);
    console.error('╠══════════════════════════════════════════════════════════════╣');
    console.error('║ ACTION REQUIRED:                                             ║');
    console.error('║ 1. Go to Firebase Console → App Hosting                     ║');
    console.error('║ 2. Navigate to Secrets                                       ║');
    console.error('║ 3. Add FB_PRIVATE_KEY secret                                 ║');
    console.error('║ 4. Redeploy the application                                  ║');
    console.error('╚══════════════════════════════════════════════════════════════╝');
    return null;
  }
    
  try {
    const app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FB_PROJECT_ID,
        clientEmail: process.env.FB_CLIENT_EMAIL,
        privateKey: privateKey,
      }),
      databaseURL: `https://${process.env.FB_PROJECT_ID}.firebaseio.com`,
    });
    
    console.log('✓ Firebase Admin SDK initialized successfully');
    return app;
  } catch (error: any) {
    console.error('╔══════════════════════════════════════════════════════════════╗');
    console.error('║ CRITICAL ERROR: Firebase Admin SDK Initialization Failed    ║');
    console.error('╠══════════════════════════════════════════════════════════════╣');
    console.error(`║ Error: ${error.message?.substring(0, 50).padEnd(50)} ║`);
    console.error(`║ Code:  ${(error.code || 'UNKNOWN').padEnd(50)} ║`);
    console.error('╠══════════════════════════════════════════════════════════════╣');
    console.error('║ Stack Trace:                                                 ║');
    console.error(error.stack);
    console.error('╚══════════════════════════════════════════════════════════════╝');
    return null;
  }
}

/**
 * Get authenticated user from request with comprehensive error handling.
 * Returns null if authentication fails - callers MUST check this.
 */
export async function getAuthenticatedUser(req?: Request): Promise<DecodedIdToken | null> {
  try {
    const adminApp = await initializeFirebaseAdmin();
    if (!adminApp) {
      console.error('[AUTH] Firebase Admin not initialized - cannot verify user');
      return null;
    }
    
    const adminAuth = adminApp.auth();
    
    let idToken: string | undefined;

    // Check Authorization header first (preferred for API routes)
    if (req?.headers.get('Authorization')?.startsWith('Bearer ')) {
      idToken = req.headers.get('Authorization')?.split('Bearer ')[1];
      console.log('[AUTH] Token found in Authorization header');
    }

    // Fallback to cookie
    if (!idToken) {
      try {
        const cookieStore = await cookies();
        const idTokenCookie = cookieStore.get('fb-id-token');
        idToken = idTokenCookie?.value;
        if (idToken) {
          console.log('[AUTH] Token found in cookie');
        }
      } catch (cookieError) {
        // cookies() may throw in certain contexts - this is expected in API routes
        console.log('[AUTH] Could not access cookies (expected in API routes)');
      }
    }

    if (!idToken) {
      console.warn('[AUTH] No ID token found in Authorization header or cookie');
      return null;
    }

    const decodedToken = await adminAuth.verifyIdToken(idToken);
    console.log(`[AUTH] ✓ Token verified successfully for user: ${decodedToken.uid}`);
    return decodedToken;
  } catch (error: any) {
    console.error('[AUTH] Error verifying Firebase ID token:', {
      message: error.message,
      code: error.code,
      name: error.name,
    });
    return null;
  }
}
