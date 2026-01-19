/**
 * DEPRECATED: This file is deprecated and will be removed.
 * Use @/lib/firebase-admin-singleton instead.
 * 
 * This file now just re-exports from the singleton to prevent breaking existing imports.
 */

export { getFirebaseAdmin, FieldValue, Timestamp, FirestoreHelpers } from './firebase-admin-singleton';

// For backward compatibility with old import patterns
export const getAdminAuth = async () => {
  const { auth } = await import('./firebase-admin-singleton').then(m => m.getFirebaseAdmin());
  return auth;
};

export const getAdminDb = async () => {
  const { db } = await import('./firebase-admin-singleton').then(m => m.getFirebaseAdmin());
  return db;
};

export const getAdminStorage = async () => {
  const { storage } = await import('./firebase-admin-singleton').then(m => m.getFirebaseAdmin());
  return storage;
};

// Do NOT export default admin - this was causing conflicts
