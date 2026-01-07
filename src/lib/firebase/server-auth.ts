'use server';

import 'dotenv/config';
import { cookies } from 'next/headers';
import admin from 'firebase-admin';
import type { DecodedIdToken, App } from 'firebase-admin/auth';

// Make this async
export async function initializeFirebaseAdmin(): Promise<App | null> {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const privateKey = process.env.FB_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!process.env.FB_PROJECT_ID || !process.env.FB_CLIENT_EMAIL || !privateKey) {
    console.error('CRITICAL: Firebase server-side environment variables are not set. The Admin SDK cannot be initialized.');
    return null;
  }
    
  try {
    return admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FB_PROJECT_ID,
        clientEmail: process.env.FB_CLIENT_EMAIL,
        privateKey: privateKey,
      }),
      databaseURL: `https://${process.env.FB_PROJECT_ID}.firebaseio.com`,
    });
  } catch (error: any) {
    console.error("Failed to initialize Firebase Admin SDK:", error);
    return null;
  }
}

export async function getAuthenticatedUser(req?: Request): Promise<DecodedIdToken | null> {
  try {
    const adminApp = await initializeFirebaseAdmin(); // Add await here
    if (!adminApp) {
      console.warn('DEBUG: Firebase Admin not initialized');
      return null;
    }
    
    const adminAuth = adminApp.auth();
    
    let idToken: string | undefined;

    if (req?.headers.get('Authorization')?.startsWith('Bearer ')) {
        idToken = req.headers.get('Authorization')?.split('Bearer ')[1];
        console.log('DEBUG: Found token in Authorization header');
    }

    if (!idToken) {
        const cookieStore = await cookies();
        const idTokenCookie = cookieStore.get('fb-id-token');
        console.log('DEBUG: Cookie store result:', idTokenCookie ? 'cookie found' : 'cookie NOT found');
        idToken = idTokenCookie?.value;
        console.log('DEBUG: Token from cookie:', idToken ? 'exists' : 'null');
    }

    if (!idToken) {
      console.warn("DEBUG: No ID token found in Authorization header or 'fb-id-token' cookie.");
      return null;
    }

    console.log('DEBUG: About to verify token');
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    console.log('DEBUG: Token verified successfully, uid:', decodedToken.uid);
    return decodedToken;
  } catch (error) {
    console.warn('DEBUG: Error verifying Firebase ID token in getAuthenticatedUser:', error);
    return null;
  }
}