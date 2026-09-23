import { describe, it, expect } from 'vitest';
import {
  getTLAStatusConfig,
  getTLASigningRole,
  getCannotSignReason,
  getWaitingMessage,
  formatTLADate,
  formatTripDuration,
  calculateTripDuration,
} from '../tla-utils';
import type { TLA, TLASignature } from '../data';

/**
 * The TLA signing lifecycle. The rule that matters: the LESSOR (driver owner)
 * signs first, then the LESSEE (load owner). These helpers decide what the
 * signing UI offers, so a hole here means offering someone a signature button
 * they should not have.
 *
 * Server-side enforcement lives in signTLA (src/lib/tla-actions.ts) and the
 * Firestore rules; those are covered by tests/rules/ and the E2E suite.
 */

function sig(role: 'lessor' | 'lessee'): TLASignature {
  return {
    signedBy: `${role}-oo`,
    signedByName: role === 'lessor' ? 'Alex Northbound' : 'Sam Gulf',
    signedByRole: role,
    signedAt: '2026-02-21T10:00:00.000Z',
  };
}

function tlaWith(overrides: Partial<TLA>): TLA {
  return {
    id: 'tla-1',
    matchId: 'match-1',
    lessor: {
      ownerOperatorId: 'lessor-oo',
      legalName: 'Northbound Carriers LLC',
      address: '12 Depot St, Lowell, MA 01852',
      contactEmail: 'ops@northbound.test',
    },
    lessee: {
      ownerOperatorId: 'lessee-oo',
      legalName: 'Gulf Freight Inc',
      address: '900 Port Rd, Tampa, FL 33602',
      contactEmail: 'dispatch@gulffreight.test',
    },
    driver: { id: 'driver-1', name: 'Dana Reyes' },
    trip: {
      origin: 'Boston, MA',
      destination: 'Tampa, FL',
      cargo: 'Palletized dry goods',
      weight: 32000,
      startDate: '2026-03-01T08:00:00.000Z',
    },
    payment: { amount: 1850 },
    insurance: {},
    status: 'pending_lessor',
    createdAt: '2026-02-20T00:00:00.000Z',
    version: 1,
    ...overrides,
  };
}

const LESSOR = { isLessor: true, isLessee: false };
const LESSEE = { isLessor: false, isLessee: true };
const OUTSIDER = { isLessor: false, isLessee: false };

const role = (tla: TLA | null, who: typeof LESSOR) =>
  getTLASigningRole(tla, 'user-1', who.isLessor, who.isLessee);

describe('getTLASigningRole — signing order', () => {
  it('offers the lessor the pen first', () => {
    expect(role(tlaWith({ status: 'pending_lessor' }), LESSOR)).toBe('lessor');
  });

  it('also lets the lessor sign from draft', () => {
    expect(role(tlaWith({ status: 'draft' }), LESSOR)).toBe('lessor');
  });

  it('does NOT let the lessee sign before the lessor — the core ordering rule', () => {
    expect(role(tlaWith({ status: 'pending_lessor' }), LESSEE)).toBeNull();
    expect(role(tlaWith({ status: 'draft' }), LESSEE)).toBeNull();
  });

  it('offers the lessee the pen once the lessor has signed', () => {
    const tla = tlaWith({ status: 'pending_lessee', lessorSignature: sig('lessor') });
    expect(role(tla, LESSEE)).toBe('lessee');
  });

  it('does not offer the lessor a second signature', () => {
    const tla = tlaWith({ status: 'pending_lessee', lessorSignature: sig('lessor') });
    expect(role(tla, LESSOR)).toBeNull();
  });

  it('never offers an already-recorded signature again', () => {
    expect(role(tlaWith({ status: 'pending_lessor', lessorSignature: sig('lessor') }), LESSOR)).toBeNull();
    expect(
      role(
        tlaWith({ status: 'pending_lessee', lessorSignature: sig('lessor'), lesseeSignature: sig('lessee') }),
        LESSEE,
      ),
    ).toBeNull();
  });
});

describe('getTLASigningRole — closed states and non-parties', () => {
  it.each(['signed', 'voided', 'in_progress', 'completed'] as const)(
    'offers nobody a signature once the TLA is %s',
    (status) => {
      const tla = tlaWith({ status, lessorSignature: sig('lessor'), lesseeSignature: sig('lessee') });
      expect(role(tla, LESSOR)).toBeNull();
      expect(role(tla, LESSEE)).toBeNull();
    },
  );

  it('offers nothing to someone who is neither party', () => {
    expect(role(tlaWith({ status: 'pending_lessor' }), OUTSIDER)).toBeNull();
    expect(role(tlaWith({ status: 'pending_lessee', lessorSignature: sig('lessor') }), OUTSIDER)).toBeNull();
  });

  it('offers nothing when there is no TLA or no signed-in user', () => {
    expect(role(null, LESSOR)).toBeNull();
    // Called directly: `role`'s default parameter would swallow an explicit undefined.
    expect(getTLASigningRole(tlaWith({ status: 'pending_lessor' }), undefined, true, false)).toBeNull();
  });
});

describe('getCannotSignReason — why the button is missing', () => {
  it('tells the lessee the lessor must go first', () => {
    expect(getCannotSignReason(tlaWith({ status: 'pending_lessor' }), 'u', false, true))
      .toBe('The driver owner (lessor) must sign this agreement first.');
  });

  it('tells the lessor they already signed', () => {
    const tla = tlaWith({ status: 'pending_lessee', lessorSignature: sig('lessor') });
    expect(getCannotSignReason(tla, 'u', true, false))
      .toBe('You have already signed. Waiting for the load owner (lessee) to sign.');
  });

  it('gives no reason to a party who CAN sign, so the UI shows the button instead', () => {
    expect(getCannotSignReason(tlaWith({ status: 'pending_lessor' }), 'u', true, false)).toBeNull();
    const awaitingLessee = tlaWith({ status: 'pending_lessee', lessorSignature: sig('lessor') });
    expect(getCannotSignReason(awaitingLessee, 'u', false, true)).toBeNull();
  });

  it('gives no reason without a TLA or a user', () => {
    expect(getCannotSignReason(null, 'u', true, false)).toBeNull();
    expect(getCannotSignReason(tlaWith({}), undefined, true, false)).toBeNull();
  });
});

describe('getWaitingMessage — who we are waiting on', () => {
  it('tells a lessee who signed out of order that the lessor still owes a signature', () => {
    // Reachable because signTLA records a lessee signature and sets the status
    // back to pending_lessor when the lessor has not signed yet.
    const tla = tlaWith({ status: 'pending_lessor', lesseeSignature: sig('lessee') });
    expect(getWaitingMessage(tla, 'u', false, true))
      .toBe('You have signed. Waiting for the driver owner (lessor) to sign.');
  });

  it('tells the signed lessor we are waiting on the lessee', () => {
    const tla = tlaWith({ status: 'pending_lessee', lessorSignature: sig('lessor') });
    expect(getWaitingMessage(tla, 'u', true, false))
      .toBe('You have signed. Waiting for the load owner (lessee) to sign.');
  });

  it('stays silent when the viewer has not signed yet', () => {
    expect(getWaitingMessage(tlaWith({ status: 'pending_lessor' }), 'u', true, false)).toBeNull();
    expect(getWaitingMessage(tlaWith({ status: 'signed' }), 'u', true, false)).toBeNull();
  });
});

describe('getTLAStatusConfig', () => {
  it.each([
    ['draft', 'Draft'],
    ['pending_lessor', 'Awaiting Lessor'],
    ['pending_lessee', 'Awaiting Lessee'],
    ['signed', 'Signed'],
    ['in_progress', 'In Progress'],
    ['completed', 'Completed'],
    ['voided', 'Voided'],
  ] as const)('labels %s as "%s"', (status, label) => {
    expect(getTLAStatusConfig(status).label).toBe(label);
  });

  it('marks a voided agreement destructive so it reads as dead in the UI', () => {
    expect(getTLAStatusConfig('voided').variant).toBe('destructive');
  });

  it('falls back to the raw status for an unrecognised value instead of rendering blank', () => {
    const cfg = getTLAStatusConfig('something_new' as TLA['status']);
    expect(cfg.label).toBe('something_new');
    expect(cfg.variant).toBe('outline');
  });
});

describe('trip duration', () => {
  it('measures whole minutes between start and end', () => {
    expect(calculateTripDuration('2026-03-01T08:00:00.000Z', '2026-03-01T09:30:00.000Z')).toBe(90);
  });

  it('spans multi-day trips', () => {
    expect(calculateTripDuration('2026-03-01T08:00:00.000Z', '2026-03-03T08:00:00.000Z')).toBe(2880);
  });

  it('returns 0 rather than NaN when a timestamp is unparseable', () => {
    // Regression: differenceInMinutes returns NaN instead of throwing, so the
    // try/catch never fired and formatTripDuration rendered "NaN hour NaN min".
    expect(calculateTripDuration('garbage', 'nonsense')).toBe(0);
    expect(calculateTripDuration('2026-03-01T08:00:00.000Z', '')).toBe(0);
  });

  it('never renders NaN into a duration string', () => {
    const duration = calculateTripDuration('garbage', 'nonsense');
    expect(formatTripDuration(duration)).not.toContain('NaN');
    expect(formatTripDuration(duration)).toBe('0 minutes');
  });

  it('reports a negative duration when the clocks are out of order, rather than hiding it', () => {
    expect(calculateTripDuration('2026-03-02T10:00:00.000Z', '2026-03-01T10:00:00.000Z')).toBe(-1440);
  });
});

describe('formatTripDuration', () => {
  it.each([
    [0, '0 minutes'],
    [45, '45 minutes'],
    [60, '1 hour'],
    [90, '1 hour 30 min'],
    [120, '2 hours'],
    [1500, '25 hours'],
    [1545, '25 hours 45 min'],
  ])('renders %i minutes as "%s"', (minutes, expected) => {
    expect(formatTripDuration(minutes)).toBe(expected);
  });
});

describe('formatTLADate', () => {
  it('renders an ISO timestamp in the display format', () => {
    expect(formatTLADate('2026-03-01T08:05:00.000Z')).toMatch(/^Mar 1, 2026 at \d{1,2}:\d{2} (AM|PM)$/);
  });

  it('says "Not specified" for a missing date instead of rendering nothing', () => {
    expect(formatTLADate(undefined)).toBe('Not specified');
    expect(formatTLADate('')).toBe('Not specified');
  });

  it('returns the raw value rather than throwing on an unparseable date', () => {
    expect(formatTLADate('garbage')).toBe('garbage');
  });
});
