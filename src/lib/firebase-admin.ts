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
    
    // Check for individual environment variables (used in production)
    const projectId = process.env.FB_PROJECT_ID;
    const clientEmail = process.env.FB_CLIENT_EMAIL;
    const privateKey = process.env.FB_PRIVATE_KEY;
    
    console.log('🔵 Environment check:');
    console.log('  - FB_PROJECT_ID:', !!projectId);
    console.log('  - FB_CLIENT_EMAIL:', !!clientEmail);
    console.log('  - FB_PRIVATE_KEY:', !!privateKey);
    
    if (projectId && clientEmail && privateKey) {
      console.log('🔵 Using individual environment variables');
      
      // Replace escaped newlines in private key
      const formattedPrivateKey = privateKey.replace(/\\n/g, '\n');
      
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: formattedPrivateKey,
        }),
      });
      console.log('✅ Firebase Admin initialized with individual credentials');
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      console.log('🔵 Using FIREBASE_SERVICE_ACCOUNT from env');
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('✅ Firebase Admin initialized with service account');
    } else {
      console.log('⚠️ No credentials found, using default credentials');
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
