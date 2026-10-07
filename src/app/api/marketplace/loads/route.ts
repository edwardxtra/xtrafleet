/**
 * Marketplace load discovery — the server-side replacement for the browser's
 * unfiltered collectionGroup('loads') subscription.
 *
 * Same shape and the same reasons as /api/marketplace/drivers: /dashboard/matches
 * streams every load document in the platform into every browser and filters
 * by status locally, which means the page downloads loads it then throws away
 * and the cost grows with the size of the network rather than with the board.
 *
 * The disclosure here is narrower than the driver one — a posted rate is the
 * offer, so it belongs on the board. What does not is `externalRefs`, which
 * carries the poster's TMS connection id and a deep link into their provider
 * UI. See WITHHELD_LOAD_FIELDS.
 *
 * Unlike the driver query, status IS filtered in Firestore. Every load written
 * by /api/loads carries a status, so there is no missing-field case to work
 * around — the thing that forced pre-activation filtering into application
 * code on the driver side.
 *
 * NOTHING CALLS THIS YET. It ships ahead of the client switch so the index it
 * needs is live before any code depends on it.
 */
import { NextRequest, NextResponse } from 'next/server';
import { withCors } from '@/lib/api-cors';
import { requireMarketplaceAccess, parseLimit } from '@/lib/marketplace/access';
import {
  projectLoad,
  isLoadAvailable,
  MARKETPLACE_LOAD_STATUSES,
} from '@/lib/marketplace/projection';
import type { Load } from '@/lib/data';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status });
}

async function handleGet(request: NextRequest) {
  try {
    const access = await requireMarketplaceAccess(request);
    if (!access.ok) return access.response;
    const { db } = access;

    const params = request.nextUrl.searchParams;
    const limit = parseLimit(params.get('limit'), { fallback: DEFAULT_LIMIT, max: MAX_LIMIT });
    const cursor = params.get('cursor');

    // Ordered by document path so the cursor is stable. The `in` filter plus
    // that ordering is what firestore.indexes.json's loads index is for.
    let query = db
      .collectionGroup('loads')
      .where('status', 'in', [...MARKETPLACE_LOAD_STATUSES])
      .orderBy('__name__')
      .limit(limit);
    if (cursor) query = query.startAfter(cursor);

    const snap = await query.get();

    const loads = snap.docs
      .map((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
        const raw = doc.data() as Partial<Load>;
        // path is owner_operators/{ownerId}/loads/{loadId}
        const ownerId = doc.ref.path.split('/')[1];
        return { raw, id: doc.id, ownerId };
      })
      // Belt and braces: the query already filters status, but a document
      // whose status the query matched and this set does not would be a drift
      // between the index and the code, and should not reach the board.
      .filter(({ raw }: { raw: Partial<Load> }) => isLoadAvailable(raw))
      .map(({ raw, id, ownerId }: { raw: Partial<Load>; id: string; ownerId: string }) =>
        projectLoad(raw, id, ownerId)
      );

    // Cursor from the last document READ, not the last returned, so paging
    // does not stall on a page whose rows were all filtered out.
    const lastDoc = snap.docs[snap.docs.length - 1];
    const nextCursor = snap.size === limit && lastDoc ? lastDoc.ref.path : null;

    return json({ loads, nextCursor, scanned: snap.size }, 200);
  } catch (error: unknown) {
    console.error('[GET /api/marketplace/loads]', error);
    return json({ error: 'Could not load the marketplace board.' }, 500);
  }
}

export const GET = withCors(handleGet);
