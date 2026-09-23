/**
 * Inbound TMS event log (DEV-155).
 *
 * Every webhook delivery lands here first, before any business logic runs.
 * Two reasons:
 *
 *   1. **Idempotency.** Providers retry. Retries are how you end up with two
 *      assignments for one load, or a driver double-booked. The Stripe
 *      webhook in this repo already learned this lesson the hard way
 *      (DEV-84) — it dedupes by using the PaymentIntent id as the document
 *      id. Same trick here: the document id *is* the provider's event id,
 *      so a duplicate delivery is a failed create, not a second write.
 *
 *   2. **Replay.** When a mapping bug corrupts records, the fix is to
 *      correct the mapper and re-run the stored payloads. That is only
 *      possible if we kept them.
 *
 * Server-only — uses the Admin SDK. `tms_events` is closed to clients in
 * firestore.rules.
 */

import { getFirebaseAdmin } from '@/lib/firebase-admin-singleton';
import type { TmsEvent, TmsProviderId } from './types';

export const TMS_EVENTS_COLLECTION = 'tms_events';

export type TmsEventProcessingStatus =
  | 'received'    // stored, not yet handled
  | 'processed'
  | 'failed'      // handler threw; retryable
  | 'dead_letter' // exhausted retries or permanently unprocessable
  | 'skipped';    // recognized but intentionally ignored (e.g. stale update)

export interface StoredTmsEvent extends TmsEvent {
  id: string;
  provider: TmsProviderId;
  connectionId?: string;
  status: TmsEventProcessingStatus;
  attempts: number;
  receivedAt: string;
  processedAt?: string;
  error?: string;
}

/**
 * Deterministic document id. Firestore ids can't contain "/" and are capped
 * at 1500 bytes; provider event ids are usually UUIDs but nothing guarantees
 * it, so sanitize rather than trust.
 */
export function tmsEventDocId(provider: TmsProviderId, eventId: string): string {
  const safe = eventId.replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 200);
  return `${provider}__${safe}`;
}

export interface RecordEventResult {
  id: string;
  /** False when this delivery was a duplicate of one we already stored. */
  stored: boolean;
}

/**
 * Store an event exactly once.
 *
 * Uses `create()` (not `set()`) so a duplicate delivery fails at the
 * database rather than in a read-then-write race — two concurrent retries
 * of the same event can otherwise both see "not found" and both write.
 */
export async function recordTmsEvent(
  provider: TmsProviderId,
  event: TmsEvent,
  opts?: { connectionId?: string }
): Promise<RecordEventResult> {
  const { db } = await getFirebaseAdmin();
  const id = tmsEventDocId(provider, event.eventId);
  const ref = db.collection(TMS_EVENTS_COLLECTION).doc(id);

  const doc: StoredTmsEvent = {
    ...event,
    id,
    provider,
    connectionId: opts?.connectionId,
    status: 'received',
    attempts: 0,
    receivedAt: new Date().toISOString(),
  };

  try {
    await ref.create(doc);
    return { id, stored: true };
  } catch (error: unknown) {
    // ALREADY_EXISTS (code 6) is the expected duplicate path, not an error.
    const code = (error as { code?: number | string })?.code;
    if (code === 6 || code === 'already-exists') {
      return { id, stored: false };
    }
    throw error;
  }
}

export async function markTmsEventProcessed(
  id: string,
  status: Extract<TmsEventProcessingStatus, 'processed' | 'skipped'>
): Promise<void> {
  const { db } = await getFirebaseAdmin();
  await db.collection(TMS_EVENTS_COLLECTION).doc(id).update({
    status,
    processedAt: new Date().toISOString(),
  });
}

export async function markTmsEventFailed(
  id: string,
  error: string,
  opts?: { deadLetter?: boolean }
): Promise<void> {
  const { db } = await getFirebaseAdmin();
  const { FieldValue } = await import('firebase-admin/firestore');
  await db.collection(TMS_EVENTS_COLLECTION).doc(id).update({
    status: opts?.deadLetter ? 'dead_letter' : 'failed',
    // Never store the raw error object — provider errors sometimes echo the
    // request, and the request carried a credential.
    error: error.slice(0, 500),
    attempts: FieldValue.increment(1),
    processedAt: new Date().toISOString(),
  });
}
