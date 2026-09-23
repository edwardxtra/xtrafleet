import { describe, it, expect } from 'vitest';
import { generateTLA, formatTLAText } from '../tla';
import type { Match, OwnerOperator, Driver, TLA } from '../data';

/**
 * The TLA is the legal artifact this platform produces — a driver lease
 * between two carriers. Everything here is about the CONTENT of that
 * document: who the parties are, what the trip and money terms say, and
 * what the rendered text asserts. The signing lifecycle lives in
 * tla-utils.test.ts; persistence lives in the rules + E2E suites.
 */

const baseMatch: Match = {
  id: 'match-1',
  loadId: 'load-1',
  loadOwnerId: 'lessee-oo',
  driverId: 'driver-1',
  driverOwnerId: 'lessor-oo',
  initiatedBy: 'load_owner',
  recipientOwnerId: 'lessor-oo',
  status: 'accepted',
  matchScore: 88,
  originalTerms: {
    rate: 1850,
    pickupDate: '2026-03-01T08:00:00.000Z',
    deliveryDate: '2026-03-03T17:00:00.000Z',
  },
  createdAt: '2026-02-20T00:00:00.000Z',
  expiresAt: '2026-02-27T00:00:00.000Z',
  loadSnapshot: {
    origin: 'Boston, MA',
    destination: 'Tampa, FL',
    cargo: 'Palletized dry goods',
    weight: 32000,
  },
  driverSnapshot: {
    name: 'Dana Reyes',
    location: 'Lowell, MA',
    vehicleType: 'Dry Van',
  },
};

const lessorInfo: OwnerOperator = {
  id: 'lessor-oo',
  legalName: 'Northbound Carriers LLC',
  contactEmail: 'ops@northbound.test',
  dotNumber: '1000001',
  mcNumber: 'MC-111111',
  phone: '555-0100',
  hqAddress: '12 Depot St, Lowell, MA 01852',
};

const lesseeInfo: OwnerOperator = {
  id: 'lessee-oo',
  legalName: 'Gulf Freight Inc',
  contactEmail: 'dispatch@gulffreight.test',
  dotNumber: '2000002',
  mcNumber: 'MC-222222',
  phone: '555-0200',
  hqAddress: '900 Port Rd, Tampa, FL 33602',
};

const driverInfo: Driver = {
  id: 'driver-1',
  name: 'Dana Reyes',
  location: 'Lowell, MA',
  certifications: [],
  availability: 'Available',
  vehicleType: 'Dry Van',
  cdlLicense: 'S1234567',
  medicalCardExpiry: '2027-01-15',
};

function gen(overrides?: {
  match?: Partial<Match>;
  lessor?: Partial<OwnerOperator>;
  lessee?: Partial<OwnerOperator>;
  driver?: Partial<Driver>;
}) {
  return generateTLA({
    match: { ...baseMatch, ...overrides?.match },
    lessorInfo: { ...lessorInfo, ...overrides?.lessor },
    lesseeInfo: { ...lesseeInfo, ...overrides?.lessee },
    driverInfo: { ...driverInfo, ...overrides?.driver },
  });
}

describe('generateTLA — party identification', () => {
  it('maps the LESSOR to the driver owner and the LESSEE to the load owner', () => {
    // Getting this backwards would invert who operates under whose authority —
    // the single most consequential field pairing in the document.
    const tla = gen();
    expect(tla.lessor.ownerOperatorId).toBe(baseMatch.driverOwnerId);
    expect(tla.lessee.ownerOperatorId).toBe(baseMatch.loadOwnerId);
    expect(tla.lessor.legalName).toBe('Northbound Carriers LLC');
    expect(tla.lessee.legalName).toBe('Gulf Freight Inc');
  });

  it('falls back to companyName, then to "Unknown", when legalName is absent', () => {
    expect(gen({ lessor: { legalName: undefined, companyName: 'Northbound' } }).lessor.legalName)
      .toBe('Northbound');
    expect(gen({ lessor: { legalName: undefined, companyName: undefined } }).lessor.legalName)
      .toBe('Unknown');
  });

  it('carries DOT and MC numbers for both parties', () => {
    const tla = gen();
    expect(tla.lessor.dotNumber).toBe('1000001');
    expect(tla.lessor.mcNumber).toBe('MC-111111');
    expect(tla.lessee.dotNumber).toBe('2000002');
    expect(tla.lessee.mcNumber).toBe('MC-222222');
  });

  it('omits optional identifiers rather than writing undefined (Firestore rejects undefined)', () => {
    const tla = gen({ lessor: { dotNumber: undefined, mcNumber: undefined, phone: undefined } });
    expect('dotNumber' in tla.lessor).toBe(false);
    expect('mcNumber' in tla.lessor).toBe(false);
    expect('phone' in tla.lessor).toBe(false);
  });
});

describe('generateTLA — party address', () => {
  it('uses the canonical hqAddress line written by the self-serve profile', () => {
    const tla = gen();
    expect(tla.lessor.address).toBe('12 Depot St, Lowell, MA 01852');
    expect(tla.lessee.address).toBe('900 Port Rd, Tampa, FL 33602');
  });

  it('composes "Street, City, ST ZIP" from split fields when hqAddress is absent', () => {
    // Admin-onboarded accounts take this path — they store `address` rather
    // than the combined hqAddress the profile form writes.
    const tla = gen({
      lessor: {
        hqAddress: undefined,
        address: '12 Depot St',
        city: 'Lowell',
        state: 'MA',
        zip: '01852',
      },
    });
    expect(tla.lessor.address).toBe('12 Depot St, Lowell, MA 01852');
  });

  it('drops missing pieces without leaving stray separators', () => {
    const tla = gen({
      lessor: { hqAddress: undefined, address: undefined, city: 'Lowell', state: 'MA', zip: undefined },
    });
    expect(tla.lessor.address).toBe('Lowell, MA');
  });

  it('yields an empty string — never undefined — when no address is on file', () => {
    // The field is required on TLA['lessor'], and generate-tla-pdf.ts guards
    // with `if (tla.lessor.address)`, so '' correctly omits the PDF block.
    const tla = gen({
      lessor: { hqAddress: undefined, address: undefined, city: undefined, state: undefined, zip: undefined },
    });
    expect(tla.lessor.address).toBe('');
  });

  it('ignores a whitespace-only hqAddress instead of emitting blank lines', () => {
    const tla = gen({ lessor: { hqAddress: '   ', address: '12 Depot St' } });
    expect(tla.lessor.address).toBe('12 Depot St');
  });
});

describe('generateTLA — terms', () => {
  it('uses the original terms when no counter was made', () => {
    const tla = gen();
    expect(tla.payment.amount).toBe(1850);
    expect(tla.trip.startDate).toBe('2026-03-01T08:00:00.000Z');
    expect(tla.trip.endDate).toBe('2026-03-03T17:00:00.000Z');
  });

  it('prefers counter terms over original terms — the money the parties settled on', () => {
    const tla = gen({
      match: {
        status: 'countered',
        counterTerms: {
          rate: 2100,
          pickupDate: '2026-03-02T08:00:00.000Z',
          deliveryDate: '2026-03-04T17:00:00.000Z',
        },
      },
    });
    expect(tla.payment.amount).toBe(2100);
    expect(tla.trip.startDate).toBe('2026-03-02T08:00:00.000Z');
    expect(tla.trip.endDate).toBe('2026-03-04T17:00:00.000Z');
  });

  it('sets the payment due date to the delivery date', () => {
    expect(gen().payment.dueDate).toBe('2026-03-03T17:00:00.000Z');
  });

  it('omits the due date and trip end date when delivery is open-ended', () => {
    const tla = gen({ match: { originalTerms: { rate: 1850, pickupDate: '2026-03-01T08:00:00.000Z' } } });
    expect('dueDate' in tla.payment).toBe(false);
    expect('endDate' in tla.trip).toBe(false);
  });

  it('defaults the trip start to now when no pickup date was agreed', () => {
    // Worth pinning explicitly: the lease silently becomes effective TODAY
    // rather than failing, so a missing pickup date is not a visible error.
    const before = Date.now();
    const tla = gen({ match: { originalTerms: { rate: 1850 } } });
    const startedAt = new Date(tla.trip.startDate).getTime();
    expect(startedAt).toBeGreaterThanOrEqual(before);
    expect(startedAt).toBeLessThanOrEqual(Date.now());
  });

  it('copies the trip details from the load snapshot, not from live load data', () => {
    // The snapshot is what both parties saw when they agreed; a later edit to
    // the load must not retroactively change a signed lease.
    const tla = gen();
    expect(tla.trip.origin).toBe('Boston, MA');
    expect(tla.trip.destination).toBe('Tampa, FL');
    expect(tla.trip.cargo).toBe('Palletized dry goods');
    expect(tla.trip.weight).toBe(32000);
  });
});

describe('generateTLA — driver and initial state', () => {
  it('carries the driver CDL and medical card expiry when on file', () => {
    const tla = gen();
    expect(tla.driver.id).toBe('driver-1');
    expect(tla.driver.name).toBe('Dana Reyes');
    expect(tla.driver.cdlNumber).toBe('S1234567');
    expect(tla.driver.medicalCardExpiry).toBe('2027-01-15');
  });

  it('omits driver credential keys rather than writing undefined', () => {
    const tla = gen({ driver: { cdlLicense: undefined, medicalCardExpiry: undefined } });
    expect('cdlNumber' in tla.driver).toBe(false);
    expect('medicalCardExpiry' in tla.driver).toBe(false);
  });

  it('opens unsigned, awaiting the lessor, at version 1 with no insurance elected', () => {
    const tla = gen();
    expect(tla.status).toBe('pending_lessor');
    expect(tla.version).toBe(1);
    expect(tla.insurance).toEqual({});
    expect(tla.lessorSignature).toBeUndefined();
    expect(tla.lesseeSignature).toBeUndefined();
  });

  it('links back to the match it was formed from', () => {
    expect(gen().matchId).toBe('match-1');
  });

  it('produces no undefined values anywhere — the Firestore write would be rejected', () => {
    const tla = gen({
      lessor: { dotNumber: undefined, mcNumber: undefined, phone: undefined, hqAddress: undefined },
      lessee: { dotNumber: undefined, mcNumber: undefined, phone: undefined, hqAddress: undefined },
      driver: { cdlLicense: undefined, medicalCardExpiry: undefined },
      match: { originalTerms: { rate: 1850 } },
    });
    const undefinedPaths: string[] = [];
    const walk = (value: unknown, path: string) => {
      if (value === undefined) {
        undefinedPaths.push(path);
        return;
      }
      if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) walk(v, path ? `${path}.${k}` : k);
      }
    };
    walk(tla, '');
    expect(undefinedPaths).toEqual([]);
  });
});

describe('formatTLAText — the rendered agreement', () => {
  const signed: TLA = {
    ...gen(),
    id: 'tla-1',
    insurance: { option: 'existing_policy' },
    lessorSignature: {
      signedBy: 'lessor-oo',
      signedByName: 'Alex Northbound',
      signedByRole: 'lessor',
      signedAt: '2026-02-21T10:00:00.000Z',
    },
    lesseeSignature: {
      signedBy: 'lessee-oo',
      signedByName: 'Sam Gulf',
      signedByRole: 'lessee',
      signedAt: '2026-02-21T12:00:00.000Z',
    },
    status: 'signed',
  };

  it('names both carriers and the driver', () => {
    const text = formatTLAText(signed);
    expect(text).toContain('Fleet A (Lessor Carrier): Northbound Carriers LLC');
    expect(text).toContain('Fleet B (Lessee Carrier): Gulf Freight Inc');
    expect(text).toContain('Driver: Dana Reyes');
  });

  it('ticks exactly the insurance option that was elected', () => {
    const text = formatTLAText(signed);
    expect(text).toContain('☑ I confirm that my active insurance policy includes leased or temporary drivers');
    expect(text).toContain('☐ I elect to obtain trip-based coverage');
  });

  it('ticks the trip-coverage box when that option was elected instead', () => {
    const text = formatTLAText({ ...signed, insurance: { option: 'trip_coverage' } });
    expect(text).toContain('☐ I confirm that my active insurance policy');
    expect(text).toContain('☑ I elect to obtain trip-based coverage');
  });

  it('leaves both insurance boxes unticked when nothing was elected', () => {
    const text = formatTLAText({ ...signed, insurance: {} });
    expect(text).not.toContain('☑');
  });

  it('renders signature lines once signed and blank rules when unsigned', () => {
    expect(formatTLAText(signed)).toContain('Signature: Alex Northbound');
    expect(formatTLAText(signed)).toContain('Signature: Sam Gulf');

    const unsigned = formatTLAText({ ...signed, lessorSignature: undefined, lesseeSignature: undefined });
    expect(unsigned).not.toContain('Signature: Alex Northbound');
    expect(unsigned).toContain('Signature: _________________________');
  });

  it('states the FMCSA-required control clause and the platform disclaimer', () => {
    // These are the clauses that make the document do its regulatory job;
    // an edit that drops them should fail loudly.
    const text = formatTLAText(signed);
    expect(text).toContain('exclusive possession, control, and responsibility for the Driver');
    expect(text).toContain('neutral technology facilitator and not a motor carrier');
    expect(text).toContain('three (3) years');
    expect(text).toContain('governed by Delaware law');
  });

  it('shows the CDL and medical expiry inline when present, and drops them when not', () => {
    expect(formatTLAText(signed)).toContain('Holds a valid CDL (S1234567)');

    const noCreds = formatTLAText({
      ...signed,
      driver: { id: 'driver-1', name: 'Dana Reyes' },
    });
    expect(noCreds).toContain('Holds a valid CDL,');
    expect(noCreds).toContain('Possesses a current medical certificate,');
  });

  it('falls back to "Upon Delivery" / "Trip Completion" for an open-ended trip', () => {
    const openEnded = formatTLAText({
      ...signed,
      trip: { ...signed.trip, endDate: undefined },
      payment: { amount: 1850 },
    });
    expect(openEnded).toContain('– Upon Delivery');
    expect(openEnded).toContain('by Trip Completion');
  });

  it('formats the agreed rate with thousands separators', () => {
    expect(formatTLAText(signed)).toContain('$1,850');
  });
});
