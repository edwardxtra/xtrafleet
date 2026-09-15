/**
 * TMS connection store (DEV-155).
 *
 * One document per (owner-operator, provider). Server-only — see the
 * `tms_connections` block in firestore.rules for why clients never read it.
 *
 * The credential is *not* here. `credentialRef` names an entry in Secret
 * Manager (or an env var in QA), and adapters resolve it at call time. That
 * keeps TMS passwords out of Firestore exports, out of backups, and out of
 * any future "let admins view a customer's config" screen.
 */

import { getFirebaseAdmin } from '@/lib/firebase-admin-singleton';
import type { TmsConnection, TmsConnectionStatus, TmsProviderId } from './types';

export const TMS_CONNECTIONS_COLLECTION = 'tms_connections';

export async function getTmsConnection(id: string): Promise<TmsConnection | null> {
  const { db } = await getFirebaseAdmin();
  const snap = await db.collection(TMS_CONNECTIONS_COLLECTION).doc(id).get();
  return snap.exists ? ({ id: snap.id, ...snap.data() } as TmsConnection) : null;
}

export async function listTmsConnections(
  ownerOperatorId: string
): Promise<TmsConnection[]> {
  const { db } = await getFirebaseAdmin();
  const snap = await db
    .collection(TMS_CONNECTIONS_COLLECTION)
    .where('ownerOperatorId', '==', ownerOperatorId)
    .get();
  return snap.docs.map(
    (d: FirebaseFirestore.QueryDocumentSnapshot) =>
      ({ id: d.id, ...d.data() }) as TmsConnection
  );
}

/**
 * Route an inbound webhook to the connection it belongs to.
 *
 * Providers are multi-tenant: the same webhook URL receives deliveries for
 * every customer, distinguished only by an account id in the payload. If we
 * can't resolve one, the event is still stored (so it's recoverable) but no
 * customer's data is touched.
 */
export async function findConnectionByExternalAccount(
  provider: TmsProviderId,
  externalAccountId: string
): Promise<TmsConnection | null> {
  const { db } = await getFirebaseAdmin();
  const snap = await db
    .collection(TMS_CONNECTIONS_COLLECTION)
    .where('provider', '==', provider)
    .where('externalAccountId', '==', externalAccountId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() } as TmsConnection;
}

export async function setTmsConnectionStatus(
  id: string,
  status: TmsConnectionStatus,
  errorMessage?: string
): Promise<void> {
  const { db } = await getFirebaseAdmin();
  await db.collection(TMS_CONNECTIONS_COLLECTION).doc(id).update({
    status,
    updatedAt: new Date().toISOString(),
    ...(errorMessage
      ? { lastErrorAt: new Date().toISOString(), lastErrorMessage: errorMessage.slice(0, 500) }
      : {}),
  });
}
