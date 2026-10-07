/**
 * Driver commitments — who is already spoken for, and when.
 *
 * WHY THIS EXISTS
 *
 * /dashboard/matches subscribes to the whole `matches` collection filtered
 * only by status, because the matcher needs OTHER carriers' commitments to
 * know which drivers are genuinely free (DEV-203). That works because
 * `matches` is readable by any signed-in account — and that is the problem.
 * The browser receives the entire negotiation: asking rate, countered rate,
 * settled price, decline reason, and the score we gave the pairing.
 *
 * None of it is needed to answer "is this driver free on the 12th". A
 * commitment is a driver id and a date window. That is what this returns.
 *
 * WHY THIS ONE DRAINS SERVER-SIDE
 *
 * The driver and load endpoints hand the caller a cursor and let it page. This
 * one does not, and the difference is deliberate.
 *
 * A half-read list of drivers shows less capacity than exists — visibly
 * incomplete, and harmless. A half-read list of COMMITMENTS reads as "no
 * conflict found", so a driver already running a load comes back bookable.
 * The error is silent and it points the wrong way. It is the same shape as
 * DEV-204 and #270: missing information rendered as a confident yes.
 *
 * So the server pages to the end and says whether it got there. `complete:
 * false` means the conflict check CANNOT be trusted, and a caller must treat
 * every driver as unverified rather than as free. It is not a cosmetic flag.
 *
 * The set is bounded by live commitments, not by history — only four match
 * statuses hold a driver — so draining is cheap in practice. HARD_CAP exists
 * for the case where it is not.
 *
 * NOTHING CALLS THIS YET. It ships ahead of the client switch.
 */
import { NextRequest, NextResponse } from 'next/server';
import { withCors } from '@/lib/api-cors';
import { requireMarketplaceAccess } from '@/lib/marketplace/access';
import { projectCommitments } from '@/lib/marketplace/projection';
import { COMMITTED_MATCH_STATUSES } from '@/lib/commitments';
import type { Match } from '@/lib/data';

/** Documents per Firestore round trip while draining. */
const PAGE_SIZE = 500;

/**
 * Most documents this will read in one request. Past it the response comes
 * back `complete: false` rather than quietly truncated.
 *
 * At 500 per page that is 10 round trips. Live commitments across the whole
 * platform reaching five thousand would mean the matcher needs a per-driver
 * query instead of a full index, which is a different change — this cap is
 * where that change announces itself.
 */
const HARD_CAP = 5_000;

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status });
}

async function handleGet(request: NextRequest) {
  try {
    const access = await requireMarketplaceAccess(request);
    if (!access.ok) return access.response;
    const { db, callerId } = access;

    const matches: Match[] = [];
    let cursor: string | null = null;
    let complete = false;

    while (matches.length < HARD_CAP) {
      let query = db
        .collection('matches')
        .where('status', 'in', [...COMMITTED_MATCH_STATUSES])
        .orderBy('__name__')
        .limit(PAGE_SIZE);
      if (cursor) query = query.startAfter(cursor);

      const snap = await query.get();
      snap.docs.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
        matches.push({ ...(doc.data() as Omit<Match, 'id'>), id: doc.id });
      });

      if (snap.size < PAGE_SIZE) {
        complete = true;
        break;
      }
      cursor = snap.docs[snap.docs.length - 1].ref.path;
    }

    // projectCommitments drops every match that does not actually hold the
    // driver or carries no usable date, so `commitments` is normally shorter
    // than `scanned`. Both are reported: a large gap is worth noticing.
    const commitments = projectCommitments(matches, callerId);

    return json({ commitments, complete, scanned: matches.length }, 200);
  } catch (error: unknown) {
    console.error('[GET /api/commitments]', error);
    // Deliberately NOT an empty list with a 200. An error here must not be
    // readable as "no conflicts".
    return json({ error: 'Could not load driver commitments.' }, 500);
  }
}

export const GET = withCors(handleGet);
