import { describe, it, expect } from 'vitest';
import {
  projectLoad,
  isLoadAvailable,
  projectCommitments,
  WITHHELD_LOAD_FIELDS,
  WITHHELD_MATCH_FIELDS,
  MARKETPLACE_LOAD_STATUSES,
} from '@/lib/marketplace/projection';
import { COMMITTED_MATCH_STATUSES } from '@/lib/commitments';
import type { Load, Match } from '@/lib/data';

/**
 * The load and commitment halves of the projection.
 *
 * The load one is a narrower privacy case than the driver one — a posted rate
 * belongs on a load board — so most of what is pinned here is the payload
 * boundary and the TMS refs.
 *
 * The commitment one is the opposite: almost the entire match document is
 * withheld, because answering "is this driver free" needs a driver id and two
 * dates and nothing else.
 */

/** A load carrying every field a real record would, TMS refs included. */
function fullLoad(): Load {
  return {
    id: 'l1',
    origin: 'Lakeland, FL',
    destination: 'Orlando, FL',
    cargo: 'Palletized citrus',
    weight: 42000,
    status: 'Pending',
    requiredQualifications: ['hazmat'],
    trailerType: 'dry-van',
    description: 'Drop and hook.',
    ownerId: 'owner-1',
    price: 1850,
    pickupDate: '2026-11-03',
    route: { distanceText: '56 mi', durationText: '1 hr 4 min' },
    // Below here is the poster's internal plumbing.
    externalRefs: [
      {
        provider: 'mock',
        connectionId: 'conn-abc123',
        externalId: 'BROKER-ORDER-77421',
        url: 'https://p44.example.test/shipments/77421',
        syncedAt: '2026-10-01T00:00:00.000Z',
      },
    ],
    originNodeId: 'node-lakeland',
    destinationNodeId: 'node-orlando',
    corridorId: 'i4-polk',
  } as Load;
}

describe('projectLoad — the poster\'s internals stay on the server', () => {
  it('withholds every field on the blocklist', () => {
    const projected = projectLoad(fullLoad(), 'l1', 'owner-1');
    const keys = Object.keys(projected);
    const leaked = WITHHELD_LOAD_FIELDS.filter((f) => keys.includes(f));
    expect(leaked, `leaked: ${leaked.join(', ')}`).toEqual([]);
  });

  it('withholds the TMS connection id and the deep link, not just the array', () => {
    // Serialized, because a ref nested anywhere would still be a disclosure.
    const raw = JSON.stringify(projectLoad(fullLoad(), 'l1', 'owner-1'));
    expect(raw).not.toContain('conn-abc123');
    expect(raw).not.toContain('BROKER-ORDER-77421');
    expect(raw).not.toContain('p44.example.test');
  });

  it('withholds a sensitive field added to Load later', () => {
    // The whole reason the projection names what it keeps instead of deleting
    // what it drops. A blocklist would ship this.
    const withNewField = { ...fullLoad(), shipperContactEmail: 'ops@shipper.test' };
    const projected = projectLoad(withNewField as Load, 'l1', 'owner-1');
    expect(projected).not.toHaveProperty('shipperContactEmail');
    expect(JSON.stringify(projected)).not.toContain('ops@shipper.test');
  });
});

describe('projectLoad — everything the board and the matcher read survives', () => {
  it('keeps the fields the scorer uses', () => {
    const p = projectLoad(fullLoad(), 'l1', 'owner-1');
    // isEquipmentCompatible, the proximity score and the feasibility check.
    expect(p.trailerType).toBe('dry-van');
    expect(p.requiredQualifications).toEqual(['hazmat']);
    expect(p.origin).toBe('Lakeland, FL');
    expect(p.destination).toBe('Orlando, FL');
    expect(p.pickupDate).toBe('2026-11-03');
    expect(p.status).toBe('Pending');
  });

  it('keeps the posted rate — on a load board that is the offer', () => {
    expect(projectLoad(fullLoad(), 'l1', 'owner-1').price).toBe(1850);
  });

  it('carries the owner id, so the board can separate mine from theirs', () => {
    const p = projectLoad(fullLoad(), 'l1', 'owner-7');
    expect(p.ownerId).toBe('owner-7');
    expect(p.id).toBe('l1');
  });

  it('omits absent optional fields rather than writing undefined', () => {
    const bare = { origin: 'Tampa, FL', destination: 'Ocala, FL', status: 'live' } as Load;
    const p = projectLoad(bare, 'l2', 'owner-1');
    expect('price' in p).toBe(false);
    expect('trailerType' in p).toBe(false);
    expect('route' in p).toBe(false);
    // The required ones still have usable defaults.
    expect(p.weight).toBe(0);
    expect(p.requiredQualifications).toEqual([]);
  });
});

describe('isLoadAvailable', () => {
  it('accepts the legacy status alongside the current ones', () => {
    for (const status of MARKETPLACE_LOAD_STATUSES) {
      expect(isLoadAvailable({ status } as Load), status).toBe(true);
    }
    expect(MARKETPLACE_LOAD_STATUSES).toContain('Pending');
  });

  it('rejects a load that is already moving or done', () => {
    expect(isLoadAvailable({ status: 'Matched' } as Load)).toBe(false);
    expect(isLoadAvailable({ status: 'In-transit' } as Load)).toBe(false);
    expect(isLoadAvailable({ status: 'Delivered' } as Load)).toBe(false);
  });

  it('rejects a load with no status rather than guessing it is on the board', () => {
    expect(isLoadAvailable({} as Load)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Commitments
// ---------------------------------------------------------------------------

function committedMatch(over: Partial<Match> = {}): Match {
  return {
    id: 'm1',
    loadId: 'l1',
    loadOwnerId: 'owner-load',
    driverId: 'driver-1',
    driverOwnerId: 'owner-driver',
    initiatedBy: 'load_owner',
    recipientOwnerId: 'owner-driver',
    status: 'accepted',
    matchScore: 91,
    originalTerms: { rate: 2400, pickupDate: '2026-11-03', deliveryDate: '2026-11-05' },
    counterTerms: { rate: 2650, pickupDate: '2026-11-04' },
    declineReason: 'rate too low',
    createdAt: '2026-10-01T00:00:00.000Z',
    expiresAt: '2026-10-08T00:00:00.000Z',
    loadSnapshot: {
      origin: 'Lakeland, FL',
      destination: 'Orlando, FL',
      cargo: 'Palletized citrus',
      weight: 42000,
      price: 2650,
    },
    driverSnapshot: { name: 'Dana Reyes', location: 'Plant City, FL', vehicleType: 'Dry Van' },
    tlaId: 'tla-1',
    ...over,
  } as Match;
}

describe('projectCommitments — the negotiation stays on the server', () => {
  it('returns only a driver id, a kind, an id and a window', () => {
    const [c] = projectCommitments([committedMatch()], 'owner-driver');
    expect(Object.keys(c).sort()).toEqual(['driverId', 'id', 'kind', 'label', 'window']);
    expect(c.driverId).toBe('driver-1');
    expect(typeof c.window.start).toBe('number');
    expect(typeof c.window.end).toBe('number');
  });

  it('withholds every rate, price and score', () => {
    const projected = projectCommitments([committedMatch()], 'owner-driver');
    const raw = JSON.stringify(projected);
    const leaked = WITHHELD_MATCH_FIELDS.filter((f) => raw.includes(`"${f}"`));
    expect(leaked, `leaked: ${leaked.join(', ')}`).toEqual([]);

    // The values, not just the keys. Substring-matching the serialized form
    // would be unreliable — the window is a 13-digit epoch and "2400" is a
    // plausible run of digits inside one. So walk the structure instead and
    // assert that the ONLY numbers crossing the boundary are the two dates.
    const numbersOutsideWindow: number[] = [];
    const walk = (value: unknown, inWindow: boolean) => {
      if (typeof value === 'number') {
        if (!inWindow) numbersOutsideWindow.push(value);
      } else if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) walk(v, inWindow || k === 'window');
      }
    };
    walk(projected, false);
    expect(numbersOutsideWindow).toEqual([]);
    expect(raw).not.toContain('rate too low');
  });

  it('gives the employing carrier the lane, so it can see why its own driver is busy', () => {
    const [mine] = projectCommitments([committedMatch()], 'owner-driver');
    expect(mine.label).toBe('Lakeland, FL to Orlando, FL');
  });

  it("withholds the lane from a carrier that does not employ the driver", () => {
    const [theirs] = projectCommitments([committedMatch()], 'some-other-carrier');
    expect(theirs.label).toBeUndefined();
    // The window still lands — the conflict check works without the lane.
    expect(theirs.window.start).toBeGreaterThan(0);
    expect(JSON.stringify(theirs)).not.toContain('Lakeland');
  });

  it('keeps every status that actually holds a driver', () => {
    const matches = COMMITTED_MATCH_STATUSES.map((status, i) =>
      committedMatch({ id: `m${i}`, status })
    );
    expect(projectCommitments(matches, 'owner-driver')).toHaveLength(
      COMMITTED_MATCH_STATUSES.length
    );
  });

  it('drops a match that no longer holds the driver', () => {
    const open = [
      committedMatch({ id: 'm-pending', status: 'pending' }),
      committedMatch({ id: 'm-declined', status: 'declined' }),
      committedMatch({ id: 'm-completed', status: 'completed' }),
    ];
    expect(projectCommitments(open, 'owner-driver')).toEqual([]);
  });

  it('drops a committing match with no usable date rather than inventing a window', () => {
    // A commitment with no date cannot claim a conflict, and must not be
    // allowed to claim one at epoch zero.
    const undated = committedMatch({ originalTerms: { rate: 2400 }, counterTerms: undefined });
    expect(projectCommitments([undated], 'owner-driver')).toEqual([]);
  });

  it('labels each commitment with its own match id, not a shared one', () => {
    const two = [
      committedMatch({ id: 'm-a', driverId: 'driver-a' }),
      committedMatch({ id: 'm-b', driverId: 'driver-b' }),
    ];
    const out = projectCommitments(two, 'owner-driver');
    expect(out.map((c) => c.id)).toEqual(['m-a', 'm-b']);
    expect(out.map((c) => c.driverId)).toEqual(['driver-a', 'driver-b']);
  });

  it('decides the lane per match, not once for the whole batch', () => {
    // Mixed ownership in one response: mine keeps its lane, theirs does not.
    const mixed = [
      committedMatch({ id: 'm-mine', driverOwnerId: 'me' }),
      committedMatch({ id: 'm-theirs', driverOwnerId: 'them' }),
    ];
    const out = projectCommitments(mixed, 'me');
    expect(out.find((c) => c.id === 'm-mine')?.label).toBeTruthy();
    expect(out.find((c) => c.id === 'm-theirs')?.label).toBeUndefined();
  });
});
