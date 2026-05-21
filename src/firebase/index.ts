'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// IMPORTANT: DO NOT MODIFY THIS FUNCTION
export function initializeFirebase() {
  if (getApps().length === 0) {
    return initializeApp(firebaseConfig);
  } else {
    return getApp();
  }
}

// Tracks whether we've already wired the emulator connection so we don't
// double-connect across React re-renders / HMR cycles.
let emulatorConnected = false;

export function getSdks(firebaseApp: FirebaseApp) {
  const auth = getAuth(firebaseApp);
  const firestore = getFirestore(firebaseApp);
  const storage = getStorage(firebaseApp);

  // E2E emulator mode: routed by NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true.
  // Connects the client-side SDKs to the local Auth + Firestore emulators
  // booted by `firebase emulators:start`. Storage is left alone — none of
  // the E2E specs need it. Server-side Admin SDK uses its own auto-detect
  // via FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST env vars.
  if (
    !emulatorConnected &&
    typeof window !== 'undefined' &&
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true'
  ) {
    try {
      connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
      connectFirestoreEmulator(firestore, 'localhost', 8080);
      emulatorConnected = true;
      console.log('[firebase] Connected to Auth + Firestore emulators');
    } catch (err) {
      console.warn('[firebase] Failed to connect to emulators:', err);
    }
  }

  return {
    firebaseApp,
    auth,
    firestore,
    storage,
  };
}

export * from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './non-blocking-updates';
export * from './non-blocking-login';
export * from './errors';
export * from './error-emitter';
