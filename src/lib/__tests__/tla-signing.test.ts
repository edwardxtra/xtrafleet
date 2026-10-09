import { describe, it, expect } from 'vitest';
import { decideSignature, buildSignatureUpdate, type SignableTLA } from '@/lib/tla-signing';
import type { TLASignature } from '@/lib/data';

/**
 * The signature decision, over every combination of who has already signed.
 *
 * The happy path walks exactly two of these — lessor-then-lessee — which is
 * why the concurrent case was once wrong in production: two parties signing
 * at the same time each read the other as unsigned, and the second write put
 * `status` back to `pending_*` on an agreement that was in fact fully signed.
 *
 * The transaction is what makes the input fresh. These tests are what make
 * the decision right given fresh input.
 */

function sig(who: string, role: 'lessor' | 'lessee'): TLASignature {
  return {
    signedBy: who,
    signedByName: who,
    signedByRole: role,
    signedAt: '2026-01-01T00:00:00.000Z',
    ipAddress: '203.0.113.1',
    userAgent: 'test',
    consentToEsign: true,
  };
}

const LESSOR_SIG = sig('lessor-uid', 'lessor');
const LESSEE_SIG = sig('lessee-uid', 'lessee');
const NOW = () => '2026-06-01T12:00:00.000Z';

describe('decideSignature — all four prior states', () => {
  it('lessor signs an unsigned TLA: pending_lessee, not complete', () => {
    const d = decideSignature({}, 'lessor', LESSOR_SIG);
    expect(d).toEqual({ bothSigned: false, status: 'pending_lessee' });
  });

  it('lessee signs an unsigned TLA: pending_lessor, not complete', () => {
    const d = decideSignature({}, 'lessee', LESSEE_SIG);
    expect(d).toEqual({ bothSigned: false, status: 'pending_lessor' });
  });

  it('lessee signs when the lessor already has: signed', () => {
    const current: SignableTLA = { lessorSignature: LESSOR_SIG };
    expect(decideSignature(current, 'lessee', LESSEE_SIG)).toEqual({
      bothSigned: true,
      status: 'signed',
    });
  });

  it('lessor signs when the lessee already has: signed', () => {
    const current: SignableTLA = { lesseeSignature: LESSEE_SIG };
    expect(decideSignature(current, 'lessor', LESSOR_SIG)).toEqual({
      bothSigned: true,
      status: 'signed',
    });
  });
});

describe('decideSignature — the race this exists to prevent', () => {
  // Both parties hit Sign at the same moment. Firestore serialises the two
  // transactions and retries the loser, so the loser's callback re-reads a
  // document that now carries the winner's signature. The decision must come
  // out `signed` from EITHER order; if it reads a stale snapshot instead, one
  // order produces pending_* and strands the agreement.
  it('whichever party commits second sees the first and lands on signed', () => {
    const lessorFirst = decideSignature({ lessorSignature: LESSOR_SIG }, 'lessee', LESSEE_SIG);
    const lesseeFirst = decideSignature({ lesseeSignature: LESSEE_SIG }, 'lessor', LESSOR_SIG);

    expect(lessorFirst.status).toBe('signed');
    expect(lesseeFirst.status).toBe('signed');
    expect(lessorFirst).toEqual(lesseeFirst);
  });

  it('a stale snapshot would NOT produce signed — the failure being guarded', () => {
    // Passing the page-load view (nobody signed) instead of the fresh document
    // is the actual bug. Pinned so the difference is visible, not asserted
    // about in a comment alone.
    const fromStale = decideSignature({}, 'lessee', LESSEE_SIG);
    const fromFresh = decideSignature({ lessorSignature: LESSOR_SIG }, 'lessee', LESSEE_SIG);

    expect(fromStale.status).toBe('pending_lessor');
    expect(fromFresh.status).toBe('signed');
  });

  it('re-signing by the same party is idempotent in outcome', () => {
    // A double-submit (impatient click, retried transaction) must not flip a
    // half-signed TLA to signed on one party's signature alone.
    const current: SignableTLA = { lessorSignature: LESSOR_SIG };
    const d = decideSignature(current, 'lessor', LESSOR_SIG);
    expect(d).toEqual({ bothSigned: false, status: 'pending_lessee' });
  });
});

describe('buildSignatureUpdate — what actually gets written', () => {
  it('a lessor signature writes only the lessor fields', () => {
    const { update } = buildSignatureUpdate({}, 'lessor', LESSOR_SIG, { now: NOW });
    expect(update).toEqual({
      updatedAt: '2026-06-01T12:00:00.000Z',
      lessorSignature: LESSOR_SIG,
      status: 'pending_lessee',
    });
    // No signedAt until both parties have signed.
    expect(update).not.toHaveProperty('signedAt');
  });

  it('completing the TLA stamps signedAt', () => {
    const { update, decision } = buildSignatureUpdate(
      { lessorSignature: LESSOR_SIG },
      'lessee',
      LESSEE_SIG,
      { now: NOW },
    );
    expect(decision.bothSigned).toBe(true);
    expect(update.status).toBe('signed');
    expect(update.signedAt).toBe('2026-06-01T12:00:00.000Z');
  });

  it('insurance and locations ride only on the lessee signature', () => {
    const locations = { pickup: { address: '1 Main St' } };
    const { update } = buildSignatureUpdate({}, 'lessee', LESSEE_SIG, {
      insuranceOption: 'trip_coverage',
      locations,
      now: NOW,
    });
    expect(update.insurance).toEqual({
      option: 'trip_coverage',
      confirmedAt: '2026-06-01T12:00:00.000Z',
      confirmedBy: 'lessee-uid',
    });
    expect(update.locations).toBe(locations);
  });

  it('a lessor signature never carries insurance or locations', () => {
    // The sign form only collects these from the lessee; passing them with a
    // lessor signature must not write them.
    const { update } = buildSignatureUpdate({}, 'lessor', LESSOR_SIG, {
      insuranceOption: 'existing_policy',
      locations: { pickup: { address: 'ignored' } },
      now: NOW,
    });
    expect(update).not.toHaveProperty('insurance');
    expect(update).not.toHaveProperty('locations');
  });

  it('omitted insurance and locations are not written as undefined', () => {
    // Firestore rejects undefined values outright.
    const { update } = buildSignatureUpdate({}, 'lessee', LESSEE_SIG, { now: NOW });
    expect(Object.keys(update)).toEqual(['updatedAt', 'lesseeSignature', 'status']);
  });
});
