// Firebase client config - uses environment variables for multi-environment support
// QA and Production use different Firebase projects
export const firebaseConfig = {
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "studio-5112915880-e9ca2",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:320048128884:web:2a6df179b3c24ac04a0221",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "studio-5112915880-e9ca2.firebasestorage.app",
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyCi1bPOuKMT2mZUZBy3NqqBoi76GCtpOTA",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "studio-5112915880-e9ca2.firebaseapp.com",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-YCKNKG25Z5",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "320048128884",
};
