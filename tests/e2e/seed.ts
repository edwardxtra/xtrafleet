/**
 * Emulator seeding for the E2E suite.
 *
 * WHY
 *
 * Driving every precondition through the UI is why most of this suite was
 * disabled. The company-profile form alone needs FMCSA verification, a COI
 * upload and an operating-states multiselect; reaching "an owner with a
 * compliant driver and a posted load" through the browser is a dozen fragile
 * steps before the test asserts anything.
 *
 * The CI job already exports FIRESTORE_EMULATOR_HOST and
 * FIREBASE_AUTH_EMULATOR_HOST into the test process, so the Admin SDK can
 * write that state directly. Tests then drive only the flow under test.
 *
 * WHAT NOT TO SEED
 *
 * Seed preconditions, never the thing being asserted. A test for "posting a
 * load shows it on /dashboard/loads" must post through the UI — seeding the
 * load would assert nothing. Use `seedLoad` when a load is setup for a
 * *matching* test, not when load creation is the subject.
 *
 * Collection layout (from firestore.rules):
 *   owner_operators/{ownerId}
 *   owner_operators/{ownerId}/drivers/{driverId}
 *   owner_operators/{ownerId}/loads/{loadId}
 *   matches/{matchId}
 */

import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { initializeApp, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { buildAttestationEntry, type AttestationType } from '../../src/lib/attestations';

export const SEED_PASSWORD = 'TestPassword!1';

/** DOT numbers with fixtures in tests/e2e/fixtures/fmcsa/. */
export const FIXTURE_DOT = {
  /** Active authority, no discrepancy → compliance gate returns Green. */
  clean: '1000001',
  /** Inactive authority → gate returns Red and blocks the match. */
  revoked: '2000002',
  /** QCMobile active, SAFER inactive → gate returns Yellow. */
  discrepancy: '3000003',
  /** No fixture on disk → lookup fails → carrier is Unverified, match blocked. */
  unknown: '9999999',
} as const;

let app: App | undefined;

function adminApp(): App {
  if (app) return app;
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error(
      'Seeding requires the Firebase emulators. Expected FIRESTORE_EMULATOR_HOST and ' +
        'FIREBASE_AUTH_EMULATOR_HOST in the environment — run via `npm run test:e2e` ' +
        'under `firebase emulators:exec`, not against a real project.'
    );
  }
  const projectId = process.env.GCLOUD_PROJECT || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'xtrafleet-e2e';
  app = getApps().find((a) => a.name === 'e2e-seed') ?? initializeApp({ projectId }, 'e2e-seed');
  return app;
}

function db(): Firestore {
  return getFirestore(adminApp());
}

/** Release the Admin SDK app so Playwright's process can exit cleanly. */
export async function closeSeedApp(): Promise<void> {
  if (app) {
    await deleteApp(app);
    app = undefined;
  }
}

function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

export function uniqueSeedEmail(prefix = 'seed'): string {
  return `${prefix}+${Date.now()}-${Math.floor(Math.random() * 1e4)}@xtrafleet-e2e.test`;
}

// --- Owners ----------------------------------------------------------------

export interface SeedOwnerOptions {
  email?: string;
  password?: string;
  companyName?: string;
  legalName?: string;
  /** Pick from FIXTURE_DOT to choose which compliance branch this carrier hits. */
  dotNumber?: string;
  /**
   * Signup-time attestations to record. Defaults to the two the load-post
   * (#155) and marketplace (#170) gates require. Pass `[]` to seed an owner
   * who is BLOCKED by those gates — the path a fresh signup can no longer
   * reach, since /api/register now captures both.
   */
  attestations?: AttestationType[];
  /** Extra fields merged onto the owner_operators doc. */
  overrides?: Record<string, unknown>;
}

/** What /api/register records at signup. Keep in step with it. */
export const SIGNUP_ATTESTATIONS: AttestationType[] = ['profileInsurance', 'profileAuthority'];

export interface SeededOwner {
  uid: string;
  email: string;
  password: string;
  companyName: string;
  dotNumber: string;
}

/**
 * An owner with a verified Auth account and a complete profile — the state a
 * real owner reaches after signup + /create-profile.
 *
 * `profileCompletedAt` and the attestation-relevant fields are set so the
 * owner clears the #170 profile gate; tests that want to assert the gate
 * BLOCKS someone should omit them via `overrides`.
 */
export async function seedOwner(opts: SeedOwnerOptions = {}): Promise<SeededOwner> {
  const email = opts.email ?? uniqueSeedEmail('oo');
  const password = opts.password ?? SEED_PASSWORD;
  const companyName = opts.companyName ?? `E2E Fleet ${Date.now()}`;
  const dotNumber = opts.dotNumber ?? FIXTURE_DOT.clean;

  const user = await getAuth(adminApp()).createUser({
    email,
    password,
    emailVerified: true,
    displayName: companyName,
  });

  const now = new Date().toISOString();
  await db()
    .collection('owner_operators')
    .doc(user.uid)
    .set({
      companyName,
      legalName: opts.legalName ?? companyName,
      contactEmail: email,
      contactName: 'E2E Owner',
      phone: '6175550100',
      address: '1 Seaport Blvd',
      city: 'Boston',
      state: 'MA',
      zip: '02210',
      dotNumber,
      mcNumber: '900001',
      accountStatus: 'active',
      isAdmin: false,
      createdAt: now,
      profileCompletedAt: now,
      // Built with the production helper rather than hand-rolled, so a change
      // to the attestation text or version cannot silently desync the suite
      // from what /api/register actually writes.
      attestations: (opts.attestations ?? SIGNUP_ATTESTATIONS).map((type) =>
        buildAttestationEntry(type, user.uid, { ip: '127.0.0.1', userAgent: 'e2e-seed' })
      ),
      insurance: { coiDocumentUrl: 'https://example.test/e2e-coi.pdf', coiDocumentUploadedAt: now },
      ...opts.overrides,
    });

  return { uid: user.uid, email, password, companyName, dotNumber };
}

// --- Drivers ---------------------------------------------------------------

/**
 * Compliance presets. These set the date fields `getComplianceStatus()` reads
 * (cdlExpiry, medicalCardExpiry, insuranceExpiry, backgroundCheckDate,
 * drugAndAlcoholScreeningDate, preEmploymentScreeningDate) plus the two
 * required identifiers (cdlLicense, motorVehicleRecordNumber).
 *
 *   green  — everything present and comfortably in date
 *   yellow — valid, but an expiry inside the 30-day warning window
 *   red    — an expired document
 */
export type DriverCompliance = 'green' | 'yellow' | 'red';

function complianceFields(level: DriverCompliance): Record<string, string> {
  const base = {
    cdlLicense: 'S1234567',
    cdlState: 'MA',
    cdlClass: 'A',
    motorVehicleRecordNumber: 'MVR-E2E-001',
    backgroundCheckDate: isoDaysFromNow(-30),
    drugAndAlcoholScreeningDate: isoDaysFromNow(-30),
    preEmploymentScreeningDate: isoDaysFromNow(-30),
  };
  switch (level) {
    case 'green':
      return { ...base, cdlExpiry: isoDaysFromNow(365), medicalCardExpiry: isoDaysFromNow(365), insuranceExpiry: isoDaysFromNow(365) };
    case 'yellow':
      // Inside the 30-day warning window but not yet expired.
      return { ...base, cdlExpiry: isoDaysFromNow(365), medicalCardExpiry: isoDaysFromNow(14), insuranceExpiry: isoDaysFromNow(365) };
    case 'red':
      return { ...base, cdlExpiry: isoDaysFromNow(365), medicalCardExpiry: isoDaysFromNow(-1), insuranceExpiry: isoDaysFromNow(365) };
  }
}

export interface SeedDriverOptions {
  name?: string;
  compliance?: DriverCompliance;
  location?: string;
  availability?: 'Available' | 'On-trip' | 'Off-duty';
  isSelfDriver?: boolean;
  overrides?: Record<string, unknown>;
}

export interface SeededDriver {
  id: string;
  ownerId: string;
  name: string;
  compliance: DriverCompliance;
}

export async function seedDriver(ownerId: string, opts: SeedDriverOptions = {}): Promise<SeededDriver> {
  const id = randomUUID();
  const name = opts.name ?? 'E2E Driver';
  const compliance = opts.compliance ?? 'green';

  await db()
    .collection('owner_operators')
    .doc(ownerId)
    .collection('drivers')
    .doc(id)
    .set({
      name,
      location: opts.location ?? 'Boston, MA',
      availability: opts.availability ?? 'Available',
      vehicleType: 'Dry Van',
      trailerTypes: ['dry-van'],
      certifications: [],
      ownerId,
      isActive: true,
      isSelfDriver: opts.isSelfDriver ?? false,
      profileStatus: 'confirmed',
      dqfStatus: 'approved',
      clearinghouseStatus: 'compliant',
      profileComplete: true,
      ...complianceFields(compliance),
      ...opts.overrides,
    });

  return { id, ownerId, name, compliance };
}

// --- Loads -----------------------------------------------------------------

export interface SeedLoadOptions {
  origin?: string;
  destination?: string;
  cargo?: string;
  weight?: number;
  price?: number;
  status?: 'Pending' | 'Matched' | 'In-transit' | 'Delivered';
  overrides?: Record<string, unknown>;
}

export interface SeededLoad {
  id: string;
  ownerId: string;
  origin: string;
  destination: string;
}

/** Only for tests where a load is a precondition — never where posting one is the subject. */
export async function seedLoad(ownerId: string, opts: SeedLoadOptions = {}): Promise<SeededLoad> {
  const id = randomUUID();
  const origin = opts.origin ?? 'Boston, MA';
  const destination = opts.destination ?? 'Worcester, MA';

  await db()
    .collection('owner_operators')
    .doc(ownerId)
    .collection('loads')
    .doc(id)
    .set({
      origin,
      destination,
      cargo: opts.cargo ?? 'Palletized dry goods',
      weight: opts.weight ?? 20000,
      status: opts.status ?? 'Pending',
      requiredQualifications: [],
      trailerType: 'dry-van',
      ownerId,
      price: opts.price ?? 1850,
      pickupDate: isoDaysFromNow(2),
      description: 'Seeded by the E2E suite.',
      ...opts.overrides,
    });

  return { id, ownerId, origin, destination };
}

// --- Auth ------------------------------------------------------------------

/**
 * Log a seeded owner in through the real login form.
 *
 * Deliberately drives the UI rather than injecting a session cookie: the
 * cookie/Firebase-client desync is a regression this suite has caught before,
 * and faking it would hide exactly that class of bug.
 */
export async function logInAs(page: Page, email: string, password: string = SEED_PASSWORD) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /^log ?in$|^sign ?in$/i }).click();
  await page.waitForURL(/\/(dashboard|create-profile)/, { timeout: 30_000 });
  await expect(page).not.toHaveURL(/\/login/);
}

/** Owner + compliant driver + posted load, logged in. The common starting point. */
export async function seedReadyToMatch(
  page: Page,
  opts: { dotNumber?: string; compliance?: DriverCompliance } = {}
) {
  const owner = await seedOwner({ dotNumber: opts.dotNumber });
  const driver = await seedDriver(owner.uid, { compliance: opts.compliance ?? 'green' });
  const load = await seedLoad(owner.uid);
  await logInAs(page, owner.email, owner.password);
  return { owner, driver, load };
}

// --- Matches ---------------------------------------------------------------

export interface SeedMatchOptions {
  loadOwnerId: string;
  driverOwnerId: string;
  driverId: string;
  loadId: string;
  /** Who needs to respond. Must be the uid that will call /api/matches/accept. */
  recipientOwnerId: string;
  initiatedBy?: 'load_owner' | 'driver_owner';
  status?: 'pending' | 'countered';
  rate?: number;
  overrides?: Record<string, unknown>;
}

/**
 * A match sitting in `pending`, ready for /api/matches/accept.
 *
 * Seeding up to this point skips the two-party negotiation UI, which is not
 * what the compliance-gate tests are about. The gate itself is never seeded —
 * the test calls the real endpoint and the real `runComplianceGate()` runs.
 */
export async function seedMatch(opts: SeedMatchOptions): Promise<{ id: string }> {
  const id = randomUUID();
  const now = new Date().toISOString();

  await db()
    .collection('matches')
    .doc(id)
    .set({
      loadId: opts.loadId,
      loadOwnerId: opts.loadOwnerId,
      driverId: opts.driverId,
      driverOwnerId: opts.driverOwnerId,
      initiatedBy: opts.initiatedBy ?? 'load_owner',
      recipientOwnerId: opts.recipientOwnerId,
      status: opts.status ?? 'pending',
      matchScore: 88,
      originalTerms: { rate: opts.rate ?? 1850, pickupDate: isoDaysFromNow(2) },
      createdAt: now,
      expiresAt: isoDaysFromNow(7),
      loadSnapshot: {
        origin: 'Boston, MA',
        destination: 'Worcester, MA',
        cargo: 'Palletized dry goods',
        weight: 20000,
        price: opts.rate ?? 1850,
      },
      driverSnapshot: { name: 'E2E Driver', location: 'Boston, MA', vehicleType: 'Dry Van' },
      ...opts.overrides,
    });

  return { id };
}

/**
 * Two owners, a driver, a load and a pending match — the full precondition for
 * exercising the compliance gate. The caller is logged in as the load owner,
 * who is the recipient and therefore the one who can accept.
 *
 * `loadOwnerDot` / `driverOwnerDot` pick which FMCSA fixture each carrier
 * resolves to, which is how a test chooses the gate outcome it wants.
 */
export async function seedPendingMatch(
  page: Page,
  opts: {
    loadOwnerDot?: string;
    driverOwnerDot?: string;
    compliance?: DriverCompliance;
  } = {}
) {
  const loadOwner = await seedOwner({ dotNumber: opts.loadOwnerDot ?? FIXTURE_DOT.clean });
  const driverOwner = await seedOwner({ dotNumber: opts.driverOwnerDot ?? FIXTURE_DOT.clean });
  const driver = await seedDriver(driverOwner.uid, { compliance: opts.compliance ?? 'green' });
  const load = await seedLoad(loadOwner.uid);

  const match = await seedMatch({
    loadOwnerId: loadOwner.uid,
    driverOwnerId: driverOwner.uid,
    driverId: driver.id,
    loadId: load.id,
    recipientOwnerId: loadOwner.uid,
    initiatedBy: 'driver_owner',
  });

  await logInAs(page, loadOwner.email, loadOwner.password);
  return { loadOwner, driverOwner, driver, load, match };
}

// --- TLAs ------------------------------------------------------------------

export interface SeedTlaOptions {
  matchId: string;
  lessorOwnerId: string;
  lesseeOwnerId: string;
  driverId?: string;
  /** Pre-mark the match fee as paid — used to assert redelivery idempotency. */
  matchFeePaid?: boolean;
  overrides?: Record<string, unknown>;
}

/**
 * A signed TLA awaiting its match fee.
 *
 * Seeded rather than driven because the subject of the Stripe tests is what
 * the webhook does to this document, not how it came to exist — the
 * two-party signing flow is covered elsewhere.
 */
export async function seedTla(opts: SeedTlaOptions): Promise<{ id: string }> {
  const id = randomUUID();
  const now = new Date().toISOString();

  await db()
    .collection('tlas')
    .doc(id)
    .set({
      matchId: opts.matchId,
      lessor: {
        ownerOperatorId: opts.lessorOwnerId,
        legalName: 'E2E Lessor Carrier LLC',
        address: '12 Depot St, Lowell, MA 01852',
        contactEmail: 'lessor@xtrafleet-e2e.test',
      },
      lessee: {
        ownerOperatorId: opts.lesseeOwnerId,
        legalName: 'E2E Lessee Carrier Inc',
        address: '900 Port Rd, Tampa, FL 33602',
        contactEmail: 'lessee@xtrafleet-e2e.test',
      },
      driver: { id: opts.driverId ?? 'e2e-driver', name: 'E2E Driver' },
      trip: {
        origin: 'Boston, MA',
        destination: 'Worcester, MA',
        cargo: 'Palletized dry goods',
        weight: 20000,
        startDate: isoDaysFromNow(2),
      },
      payment: { amount: 1850 },
      insurance: {},
      status: 'signed',
      matchFeePaid: opts.matchFeePaid ?? false,
      createdAt: now,
      version: 1,
      ...opts.overrides,
    });

  return { id };
}

/** Read a TLA document back, for asserting what the webhook did to it. */
export async function readTla(tlaId: string): Promise<Record<string, any> | undefined> {
  const snap = await db().collection('tlas').doc(tlaId).get();
  return snap.exists ? (snap.data() as Record<string, any>) : undefined;
}

/** Read a payments document, keyed by PaymentIntent id. */
export async function readPayment(paymentIntentId: string): Promise<Record<string, any> | undefined> {
  const snap = await db().collection('payments').doc(paymentIntentId).get();
  return snap.exists ? (snap.data() as Record<string, any>) : undefined;
}

/** Count audit_logs entries for one action against one target. */
export async function countAuditLogs(action: string, targetId: string): Promise<number> {
  const snap = await db()
    .collection('audit_logs')
    .where('action', '==', action)
    .where('targetId', '==', targetId)
    .get();
  return snap.size;
}
