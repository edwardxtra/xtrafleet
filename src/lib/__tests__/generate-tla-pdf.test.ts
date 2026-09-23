import { describe, it, expect } from 'vitest';
import { generateTLAPDF } from '../generate-tla-pdf';
import type { TLA, TLASignature } from '../data';

/**
 * The rendered lease PDF — the artifact that actually reaches a carrier.
 *
 * HOW THIS ASSERTS
 *
 * jsPDF writes text into the content stream uncompressed, so `doc.output()`
 * contains the drawn strings literally. That means the PDF can be checked in
 * Node with no browser and no PDF parser. It does mean assertions are on
 * *content*, not layout — position, font and page breaks are not covered
 * here, and a change that renders the right words in the wrong place would
 * still pass.
 *
 * `downloadTLAPDF` is deliberately not tested: it only wires the same
 * document to a browser download.
 */

function sig(role: 'lessor' | 'lessee'): TLASignature {
  return {
    signedBy: `${role}-oo`,
    signedByName: role === 'lessor' ? 'Alex Northbound' : 'Sam Gulf',
    signedByRole: role,
    signedAt: '2026-02-21T10:00:00.000Z',
  };
}

function tlaWith(overrides: Partial<TLA> = {}): TLA {
  return {
    id: 'tla-1',
    matchId: 'match-1',
    lessor: {
      ownerOperatorId: 'lessor-oo',
      legalName: 'Northbound Carriers LLC',
      address: '12 Depot St, Lowell, MA 01852',
      dotNumber: '1000001',
      mcNumber: 'MC-111111',
      contactEmail: 'ops@northbound.test',
    },
    lessee: {
      ownerOperatorId: 'lessee-oo',
      legalName: 'Gulf Freight Inc',
      address: '900 Port Rd, Tampa, FL 33602',
      dotNumber: '2000002',
      mcNumber: 'MC-222222',
      contactEmail: 'dispatch@gulffreight.test',
    },
    driver: { id: 'driver-1', name: 'Dana Reyes', cdlNumber: 'S1234567', cdlState: 'MA' },
    trip: {
      origin: 'Boston, MA',
      destination: 'Tampa, FL',
      cargo: 'Palletized dry goods',
      weight: 32000,
      startDate: '2026-03-01T08:00:00.000Z',
    },
    payment: { amount: 1850 },
    insurance: {},
    status: 'signed',
    createdAt: '2026-02-20T00:00:00.000Z',
    version: 1,
    ...overrides,
  };
}

/**
 * The drawn text of a rendered lease, normalised for searching.
 *
 * jsPDF writes plain Latin-1 strings literally, but switches to UTF-16BE for
 * any string containing a character outside Latin-1 — which here means the
 * route arrow ("A -> B") and the insurance tick box. Those come out with a
 * NUL between every ASCII byte, so a naive substring search silently misses
 * exactly the two lines most worth asserting on. Dropping NULs puts both
 * encodings back on the same footing.
 */
function render(tla: TLA): string {
  return generateTLAPDF(tla).output().replace(/\u0000/g, '');
}

describe('generateTLAPDF — party block', () => {
  it('renders both carriers\' legal names', () => {
    const pdf = render(tlaWith());
    expect(pdf).toContain('Northbound Carriers LLC');
    expect(pdf).toContain('Gulf Freight Inc');
  });

  it('renders both carriers\' addresses', () => {
    // The regression this test exists for: generateTLA never set `address`,
    // and the guard below meant every lease silently rendered without one.
    const pdf = render(tlaWith());
    expect(pdf).toContain('12 Depot St, Lowell, MA 01852');
    expect(pdf).toContain('900 Port Rd, Tampa, FL 33602');
  });

  it('renders a lease with no addresses without failing — leases created before the fix', () => {
    const pdf = render(
      tlaWith({
        lessor: { ownerOperatorId: 'l', legalName: 'No Address Carrier', address: '', contactEmail: 'a@b.test' },
        lessee: { ownerOperatorId: 'e', legalName: 'Other Carrier', address: '', contactEmail: 'c@d.test' },
      })
    );
    expect(pdf).toContain('No Address Carrier');
    expect(pdf).toContain('Other Carrier');
    expect(pdf.startsWith('%PDF')).toBe(true);
  });

  it('renders DOT and MC numbers for both parties', () => {
    const pdf = render(tlaWith());
    expect(pdf).toContain('DOT: 1000001');
    expect(pdf).toContain('MC: MC-111111');
    expect(pdf).toContain('DOT: 2000002');
    expect(pdf).toContain('MC: MC-222222');
  });

  it('omits DOT and MC lines when the carrier has none on file', () => {
    const pdf = render(
      tlaWith({
        lessor: { ownerOperatorId: 'l', legalName: 'Unregistered Co', address: '1 Main St', contactEmail: 'a@b.test' },
        lessee: { ownerOperatorId: 'e', legalName: 'Other Co', address: '2 Main St', contactEmail: 'c@d.test' },
      })
    );
    expect(pdf).toContain('Unregistered Co');
    expect(pdf).not.toContain('DOT:');
    expect(pdf).not.toContain('MC:');
  });
});

describe('generateTLAPDF — driver, trip and money', () => {
  it('names the driver and their CDL', () => {
    const pdf = render(tlaWith());
    expect(pdf).toContain('Dana Reyes');
    expect(pdf).toContain('CDL: S1234567');
    expect(pdf).toContain('CDL State: MA');
  });

  it('renders the agreed rate with thousands separators', () => {
    expect(render(tlaWith())).toContain('$1,850');
    expect(render(tlaWith({ payment: { amount: 12500 } }))).toContain('$12,500');
  });

  it('carries the trip origin, destination and cargo', () => {
    const pdf = render(tlaWith());
    expect(pdf).toContain('Boston, MA');
    expect(pdf).toContain('Tampa, FL');
    expect(pdf).toContain('Palletized dry goods');
  });
});

describe('generateTLAPDF — signatures', () => {
  it('shows each signer\'s name once they have signed', () => {
    const pdf = render(tlaWith({ lessorSignature: sig('lessor'), lesseeSignature: sig('lessee') }));
    expect(pdf).toContain('Alex Northbound');
    expect(pdf).toContain('Sam Gulf');
  });

  it('marks an unsigned party as awaiting signature rather than leaving it blank', () => {
    const pdf = render(tlaWith({ lessorSignature: sig('lessor') }));
    expect(pdf).toContain('Alex Northbound');
    expect(pdf).toContain('Awaiting signature');
    expect(pdf).not.toContain('Sam Gulf');
  });

  it('shows both parties awaiting signature on an unsigned lease', () => {
    const pdf = render(tlaWith({ status: 'pending_lessor' }));
    expect(pdf).toContain('Awaiting signature');
    expect(pdf).not.toContain('Alex Northbound');
  });
});

describe('generateTLAPDF — insurance election', () => {
  it('states the existing-policy election', () => {
    const pdf = render(tlaWith({ insurance: { option: 'existing_policy' } }));
    expect(pdf).toContain('Lessee confirms existing insurance policy covers this trip');
  });

  it('states the trip-coverage election', () => {
    const pdf = render(tlaWith({ insurance: { option: 'trip_coverage' } }));
    expect(pdf).toContain('Lessee elected trip-based coverage');
  });

  it('states neither when nothing was elected', () => {
    const pdf = render(tlaWith({ insurance: {} }));
    expect(pdf).not.toContain('Lessee confirms existing insurance policy');
    expect(pdf).not.toContain('Lessee elected trip-based coverage');
  });

  it('always carries the liability clause', () => {
    expect(render(tlaWith())).toContain('Fleet B assumes liability');
  });
});

describe('generateTLAPDF — trip tracking', () => {
  it('omits the tracking section on a trip that never started', () => {
    expect(render(tlaWith())).not.toContain('TRIP TRACKING');
  });

  it('reports who started the trip and how long it took', () => {
    const pdf = render(
      tlaWith({
        tripTracking: {
          startedAt: '2026-03-01T08:00:00.000Z',
          startedByName: 'Dana Reyes',
          endedAt: '2026-03-01T09:30:00.000Z',
          durationMinutes: 90,
        },
      })
    );
    expect(pdf).toContain('TRIP TRACKING');
    expect(pdf).toContain('Dana Reyes');
    expect(pdf).toContain('1 hour 30 min');
  });

  it('never prints NaN for a duration that was stored wrong', () => {
    // Leases created before the calculateTripDuration fix can carry NaN.
    // `durationMinutes || 0` catches it because NaN is falsy — pinning that,
    // since it is the only thing standing between a bad value and the lease.
    const pdf = render(
      tlaWith({
        tripTracking: {
          startedAt: '2026-03-01T08:00:00.000Z',
          startedByName: 'Dana Reyes',
          endedAt: '2026-03-01T09:30:00.000Z',
          durationMinutes: Number.NaN,
        },
      })
    );
    expect(pdf).not.toContain('NaN');
    expect(pdf).toContain('0 minutes');
  });

  it('falls back to Unknown when the starter was not recorded', () => {
    const pdf = render(
      tlaWith({ tripTracking: { startedAt: '2026-03-01T08:00:00.000Z' } })
    );
    expect(pdf).toContain('Unknown');
  });
});

describe('generateTLAPDF — document integrity', () => {
  it('produces a well-formed PDF', () => {
    const pdf = render(tlaWith());
    expect(pdf.startsWith('%PDF')).toBe(true);
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('renders every required section heading', () => {
    const pdf = render(tlaWith());
    for (const heading of ['PARTIES', 'DRIVER', 'TRIP DETAILS', 'COMPENSATION', 'INSURANCE & LIABILITY', 'SIGNATURES']) {
      expect(pdf).toContain(heading);
    }
  });

  it('renders a minimal lease — only the fields the type requires', () => {
    const minimal: TLA = {
      id: 't', matchId: 'm',
      lessor: { ownerOperatorId: 'l', legalName: 'A Co', address: '', contactEmail: 'a@b.test' },
      lessee: { ownerOperatorId: 'e', legalName: 'B Co', address: '', contactEmail: 'c@d.test' },
      driver: { id: 'd', name: 'Driver' },
      trip: { origin: 'X', destination: 'Y', cargo: 'Z', weight: 1, startDate: '2026-03-01T08:00:00.000Z' },
      payment: { amount: 0 },
      insurance: {},
      status: 'draft',
      createdAt: '2026-02-20T00:00:00.000Z',
      version: 1,
    };
    expect(() => generateTLAPDF(minimal)).not.toThrow();
    expect(render(minimal).startsWith('%PDF')).toBe(true);
  });
});
