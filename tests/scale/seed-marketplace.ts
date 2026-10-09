/**
 * Bulk marketplace seeding for the scale benchmark.
 *
 * Writes carriers and drivers straight to Firestore in batches. No Auth users:
 * these carriers never sign in, they only need to EXIST so the matching page's
 * collection-group reads see a marketplace of a realistic size.
 *
 * Deliberately not in tests/e2e — this is a measurement tool, not a test, and
 * playwright.config.ts only picks up that directory.
 */
import { seedFirestore } from '../e2e/seed';

/** Firestore caps a write batch at 500 operations. */
const BATCH_LIMIT = 500;

/**
 * Cities the fallback geocoder resolves, spread across the I-4 corridor and
 * the rest of Florida. Using unlisted towns here would park every driver on
 * one coordinate and make the location score meaningless — which is exactly
 * the bug the corridor entries were added to fix.
 */
const CITIES = [
  'Lakeland, FL', 'Plant City, FL', 'Winter Haven, FL', 'Bartow, FL',
  'Auburndale, FL', 'Haines City, FL', 'Davenport, FL', 'Brandon, FL',
  'Kissimmee, FL', 'Tampa, FL', 'Orlando, FL', 'Ocala, FL',
  'Sanford, FL', 'Zephyrhills, FL', 'Lake Wales, FL', 'Mulberry, FL',
];

const TRAILERS = ['dry-van', 'reefer', 'flatbed'];
const VEHICLES = ['Dry Van', 'Reefer', 'Flatbed'] as const;

function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

export interface MarketplaceSize {
  carriers: number;
  driversPerCarrier: number;
}

export interface SeededMarketplace extends MarketplaceSize {
  drivers: number;
  seedMs: number;
}

/**
 * Seed `carriers` carriers each holding `driversPerCarrier` drivers.
 *
 * Driver documents carry the full production field set, including the ones the
 * matcher never reads. That is the point: the benchmark measures what the
 * browser actually downloads today, so trimming the shape here would flatter
 * the result.
 */
export async function seedMarketplace(size: MarketplaceSize): Promise<SeededMarketplace> {
  const db = seedFirestore();
  const started = Date.now();
  const stamp = Date.now().toString(36);

  let batch = db.batch();
  let ops = 0;

  async function flush() {
    if (ops === 0) return;
    await batch.commit();
    batch = db.batch();
    ops = 0;
  }

  async function queue(ref: FirebaseFirestore.DocumentReference, data: Record<string, unknown>) {
    batch.set(ref, data);
    ops += 1;
    if (ops >= BATCH_LIMIT) await flush();
  }

  for (let c = 0; c < size.carriers; c++) {
    const ownerId = `bench-${stamp}-c${c}`;
    const city = CITIES[c % CITIES.length];

    await queue(db.collection('owner_operators').doc(ownerId), {
      companyName: `Bench Carrier ${c}`,
      legalName: `Bench Carrier ${c} LLC`,
      contactEmail: `bench-${stamp}-c${c}@xtrafleet-bench.test`,
      contactName: 'Bench Owner',
      phone: '8635550100',
      address: '100 Bench Way',
      city: city.split(',')[0],
      state: 'FL',
      zip: '33801',
      dotNumber: String(7_000_000 + c),
      accountStatus: 'active',
      isAdmin: false,
      createdAt: new Date().toISOString(),
    });

    for (let d = 0; d < size.driversPerCarrier; d++) {
      const driverCity = CITIES[(c + d) % CITIES.length];
      const v = (c + d) % VEHICLES.length;
      await queue(
        db.collection('owner_operators').doc(ownerId).collection('drivers').doc(`d${d}`),
        {
          name: `Bench Driver ${c}-${d}`,
          email: `bench-${stamp}-c${c}d${d}@xtrafleet-bench.test`,
          location: driverCity,
          availability: 'Available',
          vehicleType: VEHICLES[v],
          trailerTypes: [TRAILERS[v]],
          certifications: [],
          ownerId,
          isActive: true,
          isSelfDriver: false,
          profileStatus: 'confirmed',
          dqfStatus: 'approved',
          clearinghouseStatus: 'compliant',
          profileComplete: true,
          accountStatus: 'active',
          rating: 4 + ((c + d) % 10) / 10,
          phoneNumber: '8635550101',
          // Compliance dates the scorer reads.
          cdlExpiry: isoDaysFromNow(400),
          medicalCardExpiry: isoDaysFromNow(300),
          insuranceExpiry: isoDaysFromNow(250),
          backgroundCheckDate: isoDaysFromNow(-120),
          drugAndAlcoholScreeningDate: isoDaysFromNow(-90),
          preEmploymentScreeningDate: isoDaysFromNow(-100),
          // Identifiers and document URLs the matcher never reads — carried so
          // the measured payload matches what production actually ships.
          cdlLicense: `S${1_000_000 + c * 100 + d}`,
          cdlState: 'FL',
          cdlClass: 'A',
          motorVehicleRecordNumber: `MVR${2_000_000 + c * 100 + d}`,
          insurerName: 'Bench Mutual',
          insurancePolicyNumber: `POL-${c}-${d}`,
          cdlDocumentUrl: 'https://example.test/bench-cdl.pdf',
          medicalCardUrl: 'https://example.test/bench-med.pdf',
          mvrUrl: 'https://example.test/bench-mvr.pdf',
          insuranceUrl: 'https://example.test/bench-ins.pdf',
          backgroundCheckUrl: 'https://example.test/bench-bg.pdf',
          drugAndAlcoholScreeningUrl: 'https://example.test/bench-da.pdf',
          preEmploymentScreeningUrl: 'https://example.test/bench-psp.pdf',
        }
      );
    }
  }

  await flush();

  return {
    ...size,
    drivers: size.carriers * size.driversPerCarrier,
    seedMs: Date.now() - started,
  };
}
