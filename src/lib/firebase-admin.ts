// Firebase Admin SDK - Server-side only
// This file should ONLY be imported in API routes (src/app/api/**)

import * as admin from 'firebase-admin';

// Singleton instance
let isInitialized = false;

function initializeAdmin() {
  // If already initialized, skip
  if (isInitialized && admin.apps.length > 0) {
    console.log('✅ Firebase Admin already initialized');
    return;
  }

  try {
    console.log('🔵 Attempting Firebase Admin initialization...');
    console.log('🔵 Current apps count:', admin.apps.length);
    console.log('🔵 Has FIREBASE_SERVICE_ACCOUNT:', !!process.env.FIREBASE_SERVICE_ACCOUNT);
    
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      console.log('🔵 Using FIREBASE_SERVICE_ACCOUNT from env');
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('✅ Firebase Admin initialized with service account');
    } else {
      console.log('⚠️ No FIREBASE_SERVICE_ACCOUNT, using default credentials');
      // This will use Application Default Credentials (ADC)
      admin.initializeApp();
      console.log('✅ Firebase Admin initialized with default credentials');
    }
    
    isInitialized = true;
    console.log('✅ Firebase Admin initialization complete');
  } catch (error) {
    console.error('❌ Firebase admin initialization error:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    throw new Error(`Failed to initialize Firebase Admin: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Initialize on first import
initializeAdmin();

export const getAdminAuth = () => {
  if (!isInitialized) {
    initializeAdmin();
  }
  return admin.auth();
};

export const getAdminDb = () => {
  if (!isInitialized) {
    initializeAdmin();
  }
  return admin.firestore();
};

export const getAdminStorage = () => {
  if (!isInitialized) {
    initializeAdmin();
  }
  return admin.storage();
};

export default admin;
