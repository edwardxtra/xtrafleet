// Firebase Admin SDK - Server-side only
// This file should ONLY be imported in API routes (src/app/api/**)

let adminInstance: any = null;

function getAdmin() {
  if (adminInstance) return adminInstance;
  
  // Dynamic import to prevent build-time initialization
  const admin = require('firebase-admin');
  
  if (!admin.apps.length) {
    try {
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      } else {
        admin.initializeApp();
      }
    } catch (error) {
      console.error('Firebase admin initialization error:', error);
    }
  }
  
  adminInstance = admin;
  return admin;
}

export const getAdminAuth = () => {
  const admin = getAdmin();
  return admin.auth();
};

export const getAdminDb = () => {
  const admin = getAdmin();
  return admin.firestore();
};

export const getAdminStorage = () => {
  const admin = getAdmin();
  return admin.storage();
};

// Backwards compatibility - these will lazy-load on first access
export const adminAuth = new Proxy({} as any, {
  get: (target, prop) => {
    return getAdminAuth()[prop];
  }
});

export const adminDb = new Proxy({} as any, {
  get: (target, prop) => {
    return getAdminDb()[prop];
  }
});

export const adminStorage = new Proxy({} as any, {
  get: (target, prop) => {
    return getAdminStorage()[prop];
  }
});

export default getAdmin;
