/**
 * Firebase Admin Singleton
 * 
 * CRITICAL: ALL API routes MUST use this file to access Firebase Admin.
 * This ensures consistent initialization and prevents the issues we experienced.
 * 
 * ✅ CORRECT USAGE:
 * import { getFirebaseAdmin, FieldValue, Timestamp } from '@/lib/firebase-admin-singleton';
 * const { auth, firestore } = await getFirebaseAdmin();
 * 
 * ❌ NEVER DO THIS:
 * import admin from 'firebase-admin';
 * admin.auth(); // This will break!
 */

import { initializeFirebaseAdmin } from '@/lib/firebase/server-auth';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

// Re-export utilities that ALL API routes must use
export { FieldValue, Timestamp };

/**
 * Get Firebase Admin services (auth, firestore, storage)
 * This is the ONLY way API routes should access Firebase Admin.
 * 
 * @throws Error if Firebase Admin fails to initialize
 * @returns Object with auth, firestore, and storage services
 */
export async function getFirebaseAdmin() {
  const app = await initializeFirebaseAdmin();
  
  if (!app) {
    throw new Error(
      'Firebase Admin not initialized. Check environment variables: FB_PROJECT_ID, FB_CLIENT_EMAIL, FB_PRIVATE_KEY'
    );
  }

  return {
    auth: app.auth(),
    firestore: app.firestore(),
    storage: app.storage(),
  };
}

/**
 * Type-safe wrapper for common Firestore operations
 * Use these instead of raw Firestore calls for better type safety
 */
export const FirestoreHelpers = {
  /**
   * Get server timestamp for Firestore documents
   */
  serverTimestamp: () => FieldValue.serverTimestamp(),
  
  /**
   * Convert Date to Firestore Timestamp
   */
  dateToTimestamp: (date: Date) => Timestamp.fromDate(date),
  
  /**
   * Convert Firestore Timestamp to Date
   */
  timestampToDate: (timestamp: any) => {
    if (!timestamp || !timestamp.toDate) return null;
    return timestamp.toDate();
  },
};
