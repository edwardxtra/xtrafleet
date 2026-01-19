// TEMPORARY FILE - DO NOT USE
// This file was deleted but something still imports it
// TODO: Find and remove the import

import type { DecodedIdToken } from 'firebase-admin/auth';

export async function getAuthenticatedUser(req?: Request): Promise<DecodedIdToken | null> {
  throw new Error('getAuthenticatedUser is deprecated - use getFirebaseAdmin() from firebase-admin-singleton instead');
}

export async function initializeFirebaseAdmin(): Promise<any> {
  throw new Error('initializeFirebaseAdmin is deprecated - use getFirebaseAdmin() from firebase-admin-singleton instead');
}
