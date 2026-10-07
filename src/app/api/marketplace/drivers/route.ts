/**
 * Marketplace driver discovery — the server-side replacement for the browser's
 * unfiltered collectionGroup('drivers') subscription.
 *
 * WHY THIS EXISTS
 *
 * /dashboard/matches currently streams every driver document in the platform
 * into every user's browser and matches over all of it locally. Two problems,
 * one cause:
 *
 *   - Privacy. A driver document is the whole qualification file. Any signed-in
 *     account could read CDL numbers, MVR numbers and the storage URLs for the
 *     background check and drug-and-alcohol screening.
 *   - Scale. The benchmark in tests/scale measured ~1.3 KB per driver with
 *     nothing bounding it, and past roughly 18k documents the listener stops
 *     delivering and the marketplace silently reads as empty.
 *
 * The projection fixes the first and most of the second: the matcher reads
 * about a dozen fields, the document carries more than forty, and the thirty
 * it does not need are the sensitive ones.
 *
 * NOTHING CALLS THIS YET. It ships ahead of the client switch so the endpoint
 * can be reviewed and exercised on its own, and so the index it needs is live
 * before any code depends on it.
 *
 * WHAT IT DOES NOT DO YET
 *
 * No geographic filter. Firestore has no native geo query, so narrowing by
 * distance needs geohashing — a separate piece. Until that lands a client
 * still pages through the whole marketplace, just in bounded, projected pages
 * instead of one unbounded stream. The per-driver cost drops; the total still
 * scales with the network.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase-admin-singleton';
import { authenticateRequest, type AuthenticatedUser } from '@/lib/api-auth';
import { withCors } from '@/lib/api-cors';
import { hasCurrent, type AttestationEntry, type AttestationType } from '@/lib/attestations';
import { projectDriver, isMarketplaceVisible } from '@/lib/marketplace/projection';
import type { Driver } from '@/lib/data';

/**
 * Same gate as the matching UI and the AI agent's findAvailableDrivers. A
 * carrier sees other carriers' capacity only once its own insurance and DOT
 * authority attestations are on file.
 */
const MARKETPLACE_ATTESTATIONS: AttestationType[] = ['profileInsurance', 'profileAuthority'];

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status });
}

async function handleGet(request: NextRequest) {
  try {
    // authenticateRequest THROWS on failure and returns the decoded token, so
    // it needs its own try — the outer catch would turn a missing session into
    // a 500 and tell the caller the server broke rather than that they are not
    // signed in.
    let decoded: AuthenticatedUser;
    try {
      decoded = await authenticateRequest(request);
    } catch {
      return json({ error: 'You must be signed in.' }, 401);
    }
    const callerId = decoded.uid;

    const { db } = await getFirebaseAdmin();

    // Gate before reading anything.
    const ownerSnap = await db.collection('owner_operators').doc(callerId).get();
    const ownerData = ownerSnap.exists
      ? (ownerSnap.data() as { attestations?: AttestationEntry[] })
      : {};
    const missing = MARKETPLACE_ATTESTATIONS.filter((t) => !hasCurrent(ownerData.attestations, t));
    if (missing.length > 0) {
      return json(
        {
          error:
            'Finding outside capacity needs your profile compliance attestations on file first — ' +
            'insurance and DOT authority. Complete those on your profile and this will work.',
          missingAttestations: missing,
        },
        403
      );
    }

    const params = request.nextUrl.searchParams;
    const requested = parseInt(params.get('limit') ?? '', 10);
    const limit = Math.min(
      Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_LIMIT,
      MAX_LIMIT
    );
    const cursor = params.get('cursor');

    // Ordered by document path so the cursor is stable and needs no extra
    // index beyond the isActive filter.
    let query = db
      .collectionGroup('drivers')
      .where('isActive', '==', true)
      .orderBy('__name__')
      .limit(limit);
    if (cursor) query = query.startAfter(cursor);

    const snap = await query.get();

    const drivers = snap.docs
      .map((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
        const raw = doc.data() as Partial<Driver>;
        // path is owner_operators/{ownerId}/drivers/{driverId}
        const ownerId = doc.ref.path.split('/')[1];
        return { raw, id: doc.id, ownerId };
      })
      // Explicit annotations: the chained callbacks lose the element type.
      // Pre-activation is filtered here rather than in the query: legacy
      // drivers carry no accountStatus and a query cannot match a missing
      // field, so filtering there would drop every driver predating it.
      .filter(({ raw }: { raw: Partial<Driver> }) => isMarketplaceVisible(raw))
      .map(({ raw, id, ownerId }: { raw: Partial<Driver>; id: string; ownerId: string }) =>
        projectDriver(raw, id, ownerId)
      );

    // The cursor comes from the last document READ, not the last returned, so
    // paging does not stall on a page whose rows were all filtered out.
    const lastDoc = snap.docs[snap.docs.length - 1];
    const nextCursor = snap.size === limit && lastDoc ? lastDoc.ref.path : null;

    return json({ drivers, nextCursor, scanned: snap.size }, 200);
  } catch (error: unknown) {
    console.error('[GET /api/marketplace/drivers]', error);
    return json({ error: 'Could not load marketplace drivers.' }, 500);
  }
}

export const GET = withCors(handleGet);
