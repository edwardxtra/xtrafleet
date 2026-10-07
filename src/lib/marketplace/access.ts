/**
 * The gate every marketplace discovery endpoint sits behind.
 *
 * WHY IT IS ITS OWN MODULE
 *
 * A carrier sees other carriers' capacity only once its own insurance and DOT
 * authority attestations are on file. The matching UI applies that rule, and
 * so does the AI agent's findAvailableDrivers. As discovery moves server-side
 * there is now one such check per endpoint, and an endpoint that forgot it
 * would be a hole in a gate the other three enforce — which is exactly the
 * kind of gap that survives review. So the check lives in one place and each
 * endpoint's first statement is a call to it.
 *
 * Returns a discriminated result rather than throwing: a thrown gate failure
 * reads as a 500 to the caller, and "you are not signed in" and "the server
 * broke" are not the same answer.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase-admin-singleton';
import { authenticateRequest } from '@/lib/api-auth';
import { hasCurrent, type AttestationEntry, type AttestationType } from '@/lib/attestations';

/** Insurance and DOT authority — the same pair the matching UI requires. */
export const MARKETPLACE_ATTESTATIONS: AttestationType[] = [
  'profileInsurance',
  'profileAuthority',
];

export type MarketplaceAccess =
  | { ok: true; callerId: string; db: FirebaseFirestore.Firestore }
  | { ok: false; response: NextResponse };

export async function requireMarketplaceAccess(
  request: NextRequest
): Promise<MarketplaceAccess> {
  // authenticateRequest THROWS on failure and returns the decoded token, so it
  // needs its own try. Without it a missing session becomes a 500.
  let callerId: string;
  try {
    const decoded = await authenticateRequest(request);
    callerId = decoded.uid;
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'You must be signed in.' }, { status: 401 }),
    };
  }

  const { db } = await getFirebaseAdmin();

  const ownerSnap = await db.collection('owner_operators').doc(callerId).get();
  const ownerData = ownerSnap.exists
    ? (ownerSnap.data() as { attestations?: AttestationEntry[] })
    : {};
  const missing = MARKETPLACE_ATTESTATIONS.filter((t) => !hasCurrent(ownerData.attestations, t));
  if (missing.length > 0) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            'Finding outside capacity needs your profile compliance attestations on file first — ' +
            'insurance and DOT authority. Complete those on your profile and this will work.',
          missingAttestations: missing,
        },
        { status: 403 }
      ),
    };
  }

  return { ok: true, callerId, db };
}

/** Clamp a caller-supplied `limit` to something the server is willing to scan. */
export function parseLimit(
  raw: string | null,
  { fallback, max }: { fallback: number; max: number }
): number {
  const requested = parseInt(raw ?? '', 10);
  return Math.min(Number.isFinite(requested) && requested > 0 ? requested : fallback, max);
}
