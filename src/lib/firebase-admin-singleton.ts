/**
 * Firebase Admin Singleton
 * 
 * CRITICAL: ALL API routes MUST use this file to access Firebase Admin.
 * This ensures consistent initialization and prevents conflicts.
 * 
 * ✅ CORRECT USAGE:
 * import { getFirebaseAdmin, FieldValue, Timestamp } from '@/lib/firebase-admin-singleton';
 * const { auth, db } = await getFirebaseAdmin();
 * 
 * ❌ NEVER DO THIS:
 * import admin from 'firebase-admin';
 * admin.auth(); // This will break!
 */

import admin from 'firebase-admin';
import type { App } from 'firebase-admin/app';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

// Re-export utilities
export { FieldValue, Timestamp };

const APP_NAME = 'xtrafleet-admin';
let adminApp: App | null = null;

/**
 * Initialize Firebase Admin SDK
 * Handles both FIREBASE_SERVICE_ACCOUNT (full JSON) and individual env vars
 */
async function initializeFirebaseAdmin(): Promise<App> {
  // Return existing app if already initialized
  if (adminApp) {
    return adminApp;
  }

  try {
    adminApp = admin.app(APP_NAME);
    return adminApp;
  } catch (e) {
    // App doesn't exist yet, continue to initialize
  }

  // Option 1: Try full service account JSON (recommended)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      console.log('[Firebase Admin] Initializing with FIREBASE_SERVICE_ACCOUNT');
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      adminApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`,
      }, APP_NAME);
      console.log('[Firebase Admin] ✓ Initialized successfully');
      return adminApp;
    } catch (error: any) {
      console.error('[Firebase Admin] Failed to parse FIREBASE_SERVICE_ACCOUNT:', error.message);
      // Fall through to try individual variables
    }
  }

  // Option 2: Try individual environment variables
  const privateKey = process.env.FB_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!process.env.FB_PROJECT_ID || !process.env.FB_CLIENT_EMAIL || !privateKey) {
    throw new Error(
      'Firebase Admin initialization failed: Missing environment variables. ' +
      'Need either FIREBASE_SERVICE_ACCOUNT or (FB_PROJECT_ID + FB_CLIENT_EMAIL + FB_PRIVATE_KEY)'
    );
  }

  console.log('[Firebase Admin] Initializing with individual env vars');
  adminApp = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FB_PROJECT_ID,
      clientEmail: process.env.FB_CLIENT_EMAIL,
      privateKey: privateKey,
    }),
    databaseURL: `https://${process.env.FB_PROJECT_ID}.firebaseio.com`,
  }, APP_NAME);

  console.log('[Firebase Admin] ✓ Initialized successfully');
  return adminApp;
}

/**
 * Get Firebase Admin services (auth, db, storage)
 * This is the ONLY way API routes should access Firebase Admin.
 * 
 * @throws Error if Firebase Admin fails to initialize
 * @returns Object with auth, db (firestore), and storage services
 */
export async function getFirebaseAdmin() {
  const app = await initializeFirebaseAdmin();
  
  return {
    auth: app.auth(),
    db: app.firestore(),
    storage: app.storage(),
  };
}

/**
 * Type-safe wrapper for common Firestore operations
 */
export const FirestoreHelpers = {
  serverTimestamp: () => FieldValue.serverTimestamp(),
  dateToTimestamp: (date: Date) => Timestamp.fromDate(date),
  timestampToDate: (timestamp: any) => {
    if (!timestamp || !timestamp.toDate) return null;
    return timestamp.toDate();
  },
};
