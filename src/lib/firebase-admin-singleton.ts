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

  // Option 0: Emulator mode (E2E / local).
  // When the Firebase emulator host env vars are set, the Admin SDK talks
  // to the local Auth + Firestore emulators and does NOT need real service-
  // account credentials — a bare projectId is enough. createCustomToken,
  // verifyIdToken, verifySessionCookie, etc. all work against the emulator
  // with unsigned tokens. This branch only triggers when the emulator host
  // vars are present, so QA / prod (which use FIREBASE_SERVICE_ACCOUNT) are
  // completely unaffected.
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    const projectId =
      process.env.GCLOUD_PROJECT ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
      'xtrafleet-e2e';
    console.log(`[Firebase Admin] Initializing in EMULATOR mode for project ${projectId}`);
    adminApp = admin.initializeApp({ projectId }, APP_NAME);
    return adminApp;
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
