import * as admin from 'firebase-admin';

let isInitialized = false;

function initializeAdmin() {
  if (isInitialized) return;
  
  if (!admin.apps.length) {
    try {
      // For Firebase App Hosting, credentials are handled automatically
      // For local development, use service account
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      } else {
        // Use default credentials (works on Firebase hosting)
        admin.initializeApp();
      }
      isInitialized = true;
    } catch (error) {
      console.error('Firebase admin initialization error:', error);
    }
  }
}

export const getAdminAuth = () => {
  initializeAdmin();
  return admin.auth();
};

export const getAdminDb = () => {
  initializeAdmin();
  return admin.firestore();
};

export const getAdminStorage = () => {
  initializeAdmin();
  return admin.storage();
};

// Legacy exports for backwards compatibility - will initialize on first access
export const adminAuth = admin.auth();
export const adminDb = admin.firestore();
export const adminStorage = admin.storage();

export default admin;
