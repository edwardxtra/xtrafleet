import { describe, it, expect } from 'vitest';
import {
  buildWindow,
  windowsOverlap,
  findConflict,
  describeConflict,
  matchCommitmentWindow,
  tlaCommitmentWindow,
  commitmentsFromMatches,
  commitmentsFromTlas,
  indexCommitmentsByDriver,
  isCommittingMatch,
  isCommittingTla,
  DEFAULT_COMMITMENT_DAYS,
  type DriverCommitment,
} from '../commitments';
import type { Match, TLA, MatchStatus } from '../data';

/**
 * Commitment conflicts (DEV-203).
 *
 * The invariant: a driver already committed in the requested window must not
 * be offered again. Everything here is pure date arithmetic over windows —
 * the Firestore fetch lives in the caller.
 */

function match(overrides: Partial<Match> = {}): Match {
  return {
    id: 'match-1',
    loadId: 'load-1',
    loadOwnerId: 'lessee',
    driverId: 'driver-1',
    driverOwnerId: 'lessor',
    initiatedBy: 'load_owner',
    recipientOwnerId: 'lessor',
    status: 'accepted',
    matchScore: 88,
    originalTerms: { rate: 1850, pickupDate: '2026-03-10' },
    createdAt: '2026-03-01T00:00:00.000Z',
    expiresAt: '2026-03-08T00:00:00.000Z',
    loadSnapshot: { origin: 'Boston, MA', destination: 'Tampa, FL', cargo: 'Dry goods', weight: 32000 },
    driverSnapshot: { name: 'Dana Reyes', location: 'Lowell, MA', vehicleType: 'Dry Van' },
    ...overrides,
  };
}

function tla(overrides: Partial<TLA> = {}): TLA {
  return {
    id: 'tla-1',
    matchId: 'match-1',
    lessor: { ownerOperatorId: 'l', legalName: 'A Co', address: '', contactEmail: 'a@b.test' },
    lessee: { ownerOperatorId: 'e', legalName: 'B Co', address: '', contactEmail: 'c@d.test' },
    driver: { id: 'driver-1', name: 'Dana Reyes' },
    trip: {
      origin: 'Boston, MA',
      destination: 'Tampa, FL',
      cargo: 'Dry goods',
      weight: 32000,
      startDate: '2026-03-10',
      endDate: '2026-03-13',
    },
    payment: { amount: 1850 },
    insurance: {},
    status: 'signed',
    createdAt: '2026-03-01T00:00:00.000Z',
    version: 1,
    ...overrides,
  };
}

describe('buildWindow', () => {
  it('spans start to end when both dates are known', () => {
    const w = buildWindow('2026-03-10', '2026-03-13')!;
    expect(new Date(w.start).getDate()).toBe(10);
    expect(new Date(w.end).getDate()).toBe(13);
  });

  it('assumes a default span when only a start date exists', () => {
    // Matches carry a pickup date and no end, so trip length is a guess.
    // DEFAULT_COMMITMENT_DAYS counts calendar days INCLUDING the start day,
    // so 2 days starting the 10th blocks the 10th and the 11th.
    const w = buildWindow('2026-03-10')!;
    expect(new Date(w.start).getDate()).toBe(10);
    expect(new Date(w.end).getDate()).toBe(10 + DEFAULT_COMMITMENT_DAYS - 1);
  });

  it('falls back to the default span when the end precedes the start', () => {
    const w = buildWindow('2026-03-10', '2026-03-01')!;
    expect(w.end).toBeGreaterThan(w.start);
  });

  it('covers the whole final day, not just its first instant', () => {
    const w = buildWindow('2026-03-10', '2026-03-10')!;
    const end = new Date(w.end);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
  });

  it('returns null for a missing or unparseable date rather than guessing', () => {
    expect(buildWindow(undefined)).toBeNull();
    expect(buildWindow('')).toBeNull();
    expect(buildWindow('not a date')).toBeNull();
  });
});

describe('windowsOverlap', () => {
  const w = (a: string, b: string) => buildWindow(a, b)!;

  it('detects a straightforward overlap', () => {
    expect(windowsOverlap(w('2026-03-10', '2026-03-15'), w('2026-03-12', '2026-03-18'))).toBe(true);
  });

  it('detects full containment either way round', () => {
    expect(windowsOverlap(w('2026-03-10', '2026-03-20'), w('2026-03-12', '2026-03-14'))).toBe(true);
    expect(windowsOverlap(w('2026-03-12', '2026-03-14'), w('2026-03-10', '2026-03-20'))).toBe(true);
  });

  it('treats a shared boundary day as a conflict', () => {
    // A driver delivering the morning of the 15th is not a safe pickup that day.
    expect(windowsOverlap(w('2026-03-10', '2026-03-15'), w('2026-03-15', '2026-03-18'))).toBe(true);
  });

  it('reports no overlap when the windows are genuinely apart', () => {
    expect(windowsOverlap(w('2026-03-10', '2026-03-12'), w('2026-03-13', '2026-03-15'))).toBe(false);
  });
});

describe('commitment windows from records', () => {
  it('reads a match pickup date', () => {
    const w = matchCommitmentWindow(match())!;
    expect(new Date(w.start).getDate()).toBe(10);
  });

  it('prefers counter terms — the dates the parties settled on', () => {
    const w = matchCommitmentWindow(
      match({ counterTerms: { rate: 2100, pickupDate: '2026-03-20' } })
    )!;
    expect(new Date(w.start).getDate()).toBe(20);
  });

  it('reads a TLA trip span', () => {
    const w = tlaCommitmentWindow(tla())!;
    expect(new Date(w.start).getDate()).toBe(10);
    expect(new Date(w.end).getDate()).toBe(13);
  });

  it('returns null when a match carries no usable date', () => {
    expect(matchCommitmentWindow(match({ originalTerms: { rate: 1850 } }))).toBeNull();
  });
});

describe('which states actually hold a driver', () => {
  it.each(['accepted', 'tla_pending', 'tla_signed', 'in_progress'] as MatchStatus[])(
    'a %s match holds the driver',
    (status) => expect(isCommittingMatch({ status })).toBe(true),
  );

  it.each(['pending', 'countered', 'declined', 'expired', 'cancelled', 'completed'] as MatchStatus[])(
    'a %s match does NOT hold the driver',
    (status) => expect(isCommittingMatch({ status })).toBe(false),
  );

  it('a voided or completed TLA frees the driver', () => {
    expect(isCommittingTla({ status: 'voided' })).toBe(false);
    expect(isCommittingTla({ status: 'completed' })).toBe(false);
    expect(isCommittingTla({ status: 'signed' })).toBe(true);
  });
});

describe('building the commitment list', () => {
  it('keeps committing matches and drops the rest', () => {
    const out = commitmentsFromMatches([
      match({ id: 'a', status: 'accepted' }),
      match({ id: 'b', status: 'declined' }),
      match({ id: 'c', status: 'in_progress' }),
    ]);
    expect(out.map((c) => c.id)).toEqual(['a', 'c']);
  });

  it('drops a committing match with no usable date rather than inventing one', () => {
    // Better to under-block than to hide a driver over a guess.
    expect(commitmentsFromMatches([match({ originalTerms: { rate: 1850 } })])).toEqual([]);
  });

  it('labels the conflict with the trip so the UI can name it', () => {
    expect(commitmentsFromMatches([match()])[0].label).toBe('Boston, MA to Tampa, FL');
  });

  it('keeps committing TLAs and drops the rest', () => {
    const out = commitmentsFromTlas([
      tla({ id: 'a', status: 'signed' }),
      tla({ id: 'b', status: 'voided' }),
    ]);
    expect(out.map((c) => c.id)).toEqual(['a']);
  });

  it('drops a TLA with no driver id', () => {
    const orphan = tla();
    // @ts-expect-error — exercising a malformed record
    orphan.driver = { name: 'No Id' };
    expect(commitmentsFromTlas([orphan])).toEqual([]);
  });
});

describe('findConflict', () => {
  const commitments: DriverCommitment[] = [
    { driverId: 'driver-1', kind: 'match', id: 'm1', window: buildWindow('2026-03-10', '2026-03-13')! },
  ];

  it('finds the clash when the requested window overlaps', () => {
    const hit = findConflict(commitments, buildWindow('2026-03-12', '2026-03-14')!);
    expect(hit?.id).toBe('m1');
  });

  it('returns null when the driver is free then', () => {
    expect(findConflict(commitments, buildWindow('2026-04-01', '2026-04-03')!)).toBeNull();
  });

  it('returns null for a driver with no commitments at all', () => {
    expect(findConflict(undefined, buildWindow('2026-03-12')!)).toBeNull();
    expect(findConflict([], buildWindow('2026-03-12')!)).toBeNull();
  });
});

describe('indexCommitmentsByDriver', () => {
  it('groups by driver so lookup is O(1) per candidate', () => {
    const index = indexCommitmentsByDriver([
      { driverId: 'a', kind: 'match', id: '1', window: buildWindow('2026-03-10')! },
      { driverId: 'a', kind: 'tla', id: '2', window: buildWindow('2026-04-10')! },
      { driverId: 'b', kind: 'match', id: '3', window: buildWindow('2026-03-10')! },
    ]);
    expect(index.a).toHaveLength(2);
    expect(index.b).toHaveLength(1);
    expect(index.c).toBeUndefined();
  });
});

describe('describeConflict', () => {
  it('names the date, the trip and the kind of commitment', () => {
    const text = describeConflict({
      driverId: 'd',
      kind: 'tla',
      id: 't1',
      window: buildWindow('2026-03-10', '2026-03-13')!,
      label: 'Boston, MA to Tampa, FL',
    });
    expect(text).toContain('Mar 10');
    expect(text).toContain('Boston, MA to Tampa, FL');
    expect(text).toContain('signed agreement');
  });

  it('reads cleanly when no trip label is available', () => {
    const text = describeConflict({
      driverId: 'd', kind: 'match', id: 'm1', window: buildWindow('2026-03-10')!,
    });
    expect(text).toContain('accepted match');
    expect(text).not.toContain('()');
  });
});

// ---------------------------------------------------------------------------
// Integration with the matcher — the behaviour DEV-203 actually ships.
// ---------------------------------------------------------------------------

import { findMatchingDrivers, findIneligibleDrivers } from '../matching';
import type { Driver, Load } from '../data';

function driver(id: string): Driver {
  return {
    id,
    name: `Driver ${id}`,
    location: 'Boston, MA',
    certifications: [],
    availability: 'Available',
    vehicleType: 'Dry Van',
  };
}

const load: Load = {
  id: 'load-1',
  origin: 'Boston, MA',
  destination: 'Tampa, FL',
  cargo: 'Dry goods',
  weight: 32000,
  status: 'Pending',
  requiredQualifications: [],
  pickupDate: '2026-03-12',
};

describe('matching honours commitment conflicts', () => {
  const busy = driver('busy');
  const free = driver('free');
  const pool = [busy, free];

  // `busy` is committed Mar 10-13, which covers the Mar 12 pickup.
  const commitments = indexCommitmentsByDriver([
    {
      driverId: 'busy',
      kind: 'tla',
      id: 'tla-1',
      window: buildWindow('2026-03-10', '2026-03-13')!,
      label: 'Boston, MA to Tampa, FL',
    },
  ]);

  it('drops a driver already committed in the requested window', () => {
    const ranked = findMatchingDrivers(load, pool, { commitments });
    expect(ranked.map((m) => m.driver.id)).toEqual(['free']);
  });

  it('derives the window from the load pickup date when none is passed', () => {
    // No requestedWindow supplied — findMatchingDrivers fills it from the load.
    const ranked = findMatchingDrivers(load, pool, { commitments });
    expect(ranked).toHaveLength(1);
  });

  it('explains the exclusion in the ineligible panel rather than hiding it', () => {
    const out = findIneligibleDrivers(pool, {
      commitments,
      requestedWindow: buildWindow('2026-03-12')!,
    });
    expect(out).toHaveLength(1);
    expect(out[0].driver.id).toBe('busy');
    expect(out[0].reason).toContain('Already committed');
    expect(out[0].reason).toContain('Boston, MA to Tampa, FL');
  });

  it('keeps a driver whose commitment falls outside the window', () => {
    const ranked = findMatchingDrivers(
      { ...load, pickupDate: '2026-05-01' },
      pool,
      { commitments }
    );
    expect(ranked.map((m) => m.driver.id).sort()).toEqual(['busy', 'free']);
  });

  it('changes nothing when the caller supplies no commitments', () => {
    // Regression guard: every existing call site passes no commitments, and
    // must behave exactly as it did before DEV-203.
    const ranked = findMatchingDrivers(load, pool, {});
    expect(ranked).toHaveLength(2);
    expect(findIneligibleDrivers(pool, {})).toEqual([]);
  });

  it('skips the check when a window cannot be derived from the load', () => {
    const ranked = findMatchingDrivers({ ...load, pickupDate: undefined }, pool, { commitments });
    expect(ranked).toHaveLength(2);
  });
});
