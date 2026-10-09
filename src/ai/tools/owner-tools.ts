/**
 * Read-only tools the capacity agent may call on behalf of one owner-operator
 * (DEV-151, Half A).
 *
 * THE SECURITY BOUNDARY IS THE CLOSURE
 *
 * These run server-side with the Admin SDK, which bypasses Firestore rules.
 * So the only thing standing between one carrier and another's data is the
 * scoping in this file.
 *
 * That is why `ownerId` is captured in a CLOSURE and never appears in any
 * tool's input schema. The model chooses which tool to call and with what
 * arguments — it must not be able to choose WHOSE data to read. If the owner
 * were a parameter, a prompt-injected or simply confused model could name
 * someone else's id and the query would faithfully serve it.
 *
 * Built with `tool()` rather than `ai.defineTool()` deliberately: these are
 * per-request instances, not globally registered actions, so each request
 * gets a tool set bound to exactly one caller.
 *
 * Everything here is READ-ONLY. No tool writes, and none should — an agent
 * that can act is a different risk conversation.
 */
import { tool, z } from 'genkit';
import { getFirebaseAdmin } from '@/lib/firebase-admin-singleton';
import { getComplianceStatus } from '@/lib/compliance';
import { hasDeclaredAvailability } from '@/lib/availability';
import { findMatchingDrivers } from '@/lib/matching';
import { buildWindow, commitmentsFromMatches, indexCommitmentsByDriver, COMMITTED_MATCH_STATUSES } from '@/lib/commitments';
import { hasCurrent, type AttestationEntry, type AttestationType } from '@/lib/attestations';
import type { Driver, Load, Match } from '@/lib/data';

/** The same attestations the marketplace UI gates on (#155 / #170). */
const MARKETPLACE_ATTESTATIONS: AttestationType[] = ['profileInsurance', 'profileAuthority'];

/** Document fields worth reporting, with the label a user would recognise. */
const EXPIRY_FIELDS: ReadonlyArray<{ field: keyof Driver; label: string }> = [
  { field: 'cdlExpiry', label: 'CDL' },
  { field: 'medicalCardExpiry', label: 'Medical card' },
  { field: 'insuranceExpiry', label: 'Insurance' },
];

const DriverSummarySchema = z.object({
  name: z.string(),
  location: z.string(),
  complianceStatus: z.string().describe('Green, Yellow or Red from the deterministic scorer.'),
  availabilityDeclared: z
    .boolean()
    .describe('False means nobody has declared dates — report that as unconfirmed, never as available.'),
  expiries: z.array(z.object({ document: z.string(), expires: z.string() })),
});

const LoadSummarySchema = z.object({
  origin: z.string(),
  destination: z.string(),
  cargo: z.string(),
  status: z.string(),
  pickupDate: z.string().optional(),
});

/**
 * Build the tool set for one owner. Every query is scoped to `ownerId` from
 * this closure — see the module note.
 */
export function buildOwnerTools(ownerId: string) {
  const getMyDrivers = tool(
    {
      name: 'getMyDrivers',
      description:
        "List this owner's drivers with their compliance status and document expiry dates. " +
        'Use for questions about who works here, document expiry, or compliance standing.',
      inputSchema: z.object({
        nameContains: z
          .string()
          .optional()
          .describe('Optional case-insensitive filter on the driver name.'),
      }),
      outputSchema: z.object({
        drivers: z.array(DriverSummarySchema),
        total: z.number(),
      }),
    },
    async ({ nameContains }) => {
      const { db } = await getFirebaseAdmin();
      const snap = await db.collection(`owner_operators/${ownerId}/drivers`).get();

      const drivers = snap.docs
        .map((doc: FirebaseFirestore.QueryDocumentSnapshot): Driver => ({ ...(doc.data() as Driver), id: doc.id }))
        .filter((d: Driver) => d.isActive !== false)
        .filter((d: Driver) =>
          nameContains ? (d.name || '').toLowerCase().includes(nameContains.toLowerCase()) : true
        )
        .map((d: Driver) => ({
          name: d.name || 'Unnamed driver',
          location: d.location || 'Unknown',
          complianceStatus: getComplianceStatus(d),
          availabilityDeclared: hasDeclaredAvailability(d),
          expiries: EXPIRY_FIELDS.flatMap(({ field, label }) => {
            const value = d[field];
            return typeof value === 'string' && value
              ? [{ document: label, expires: value }]
              : [];
          }),
        }));

      return { drivers, total: drivers.length };
    }
  );

  const getMyLoads = tool(
    {
      name: 'getMyLoads',
      description:
        "List this owner's posted loads. Use for questions about what freight they have, " +
        'where it is going, or how many loads are open.',
      inputSchema: z.object({
        onlyOpen: z
          .boolean()
          .optional()
          .describe('When true, return only loads still looking for a driver.'),
      }),
      outputSchema: z.object({
        loads: z.array(LoadSummarySchema),
        total: z.number(),
      }),
    },
    async ({ onlyOpen }) => {
      const { db } = await getFirebaseAdmin();
      const snap = await db.collection(`owner_operators/${ownerId}/loads`).get();

      const OPEN = new Set(['Pending', 'live', 'match_pending']);
      const loads = snap.docs
        .map((doc: FirebaseFirestore.QueryDocumentSnapshot): Load => ({ ...(doc.data() as Load), id: doc.id }))
        .filter((l: Load) => (onlyOpen ? OPEN.has(String(l.status)) : true))
        .map((l: Load) => ({
          origin: l.origin || 'Unknown',
          destination: l.destination || 'Unknown',
          cargo: l.cargo || 'Unspecified',
          status: String(l.status || 'Unknown'),
          ...(l.pickupDate ? { pickupDate: l.pickupDate } : {}),
        }));

      return { loads, total: loads.length };
    }
  );

  /**
   * Capacity search across other carriers (Half B).
   *
   * Two things make this safe to expose through an agent:
   *
   * 1. It enforces the SAME attestation gate the marketplace UI does. An
   *    agent that answered capacity questions for an owner who has not
   *    completed those attestations would be a way around the gate, which
   *    is not a thing a convenience feature gets to do.
   *
   * 2. The output schema is the data-exposure boundary. It returns only
   *    what the marketplace already shows — carrier, driver name, location,
   *    score, compliance status, availability. No licence numbers, no
   *    document URLs, no contact details.
   *
   * The ranking itself is `findMatchingDrivers` — the same deterministic
   * scorer the UI uses, now commitment-aware (DEV-203) and availability-
   * aware (DEV-204). The model phrases the result; it does not compute it.
   */
  const findAvailableDrivers = tool(
    {
      name: 'findAvailableDrivers',
      description:
        'Search other carriers for drivers who could take a load. Use when the owner asks ' +
        'whether capacity exists for a trip. Requires an origin, destination and pickup date.',
      inputSchema: z.object({
        origin: z.string().min(1).max(200).describe('Where the load picks up, e.g. "Lakeland, FL".'),
        destination: z.string().min(1).max(200).describe('Where the load delivers.'),
        pickupDate: z
          .string()
          .describe('Pickup date as YYYY-MM-DD. Resolve relative dates like "next Tuesday" before calling.'),
        trailerType: z.string().max(60).optional().describe('Equipment needed, if the owner said.'),
      }),
      outputSchema: z.object({
        blocked: z
          .boolean()
          .describe('True when the owner cannot use the marketplace yet. Relay the reason; do not search anyway.'),
        reason: z.string().optional(),
        candidates: z.array(
          z.object({
            carrier: z.string(),
            driverName: z.string(),
            location: z.string(),
            score: z.number(),
            complianceStatus: z.string(),
            availability: z
              .string()
              .describe("'available', 'unknown' or 'unavailable'. 'unknown' means NOBODY DECLARED DATES — say unconfirmed, never available."),
            availabilityDetail: z.string().optional(),
          })
        ),
        total: z.number(),
      }),
    },
    async ({ origin, destination, pickupDate, trailerType }) => {
      const { db } = await getFirebaseAdmin();

      // Gate first — same as the UI.
      const ownerSnap = await db.collection('owner_operators').doc(ownerId).get();
      const ownerData = ownerSnap.exists ? (ownerSnap.data() as { attestations?: AttestationEntry[] }) : {};
      const missing = MARKETPLACE_ATTESTATIONS.filter((t) => !hasCurrent(ownerData.attestations, t));
      if (missing.length > 0) {
        return {
          blocked: true,
          reason:
            'Finding outside capacity needs your profile compliance attestations on file first — ' +
            'insurance and DOT authority. Complete those on your profile and this will work.',
          candidates: [],
          total: 0,
        };
      }

      const window = buildWindow(pickupDate);
      if (!window) {
        return { blocked: false, reason: 'That pickup date could not be read.', candidates: [], total: 0 };
      }

      // Pool: every active driver NOT in this owner's own fleet.
      const driverSnap = await db.collectionGroup('drivers').get();
      const pool: Array<Driver & { ownerId: string }> = driverSnap.docs
        .map((doc: FirebaseFirestore.QueryDocumentSnapshot) => ({
          ...(doc.data() as Driver),
          id: doc.id,
          ownerId: doc.ref.path.split('/')[1],
        }))
        .filter((d: Driver & { ownerId: string }) => d.ownerId !== ownerId && d.isActive !== false);

      // Commitments, so an already-booked driver is not offered (DEV-203).
      const matchSnap = await db
        .collection('matches')
        .where('status', 'in', [...COMMITTED_MATCH_STATUSES])
        .get();
      const commitments = indexCommitmentsByDriver(
        commitmentsFromMatches(
          matchSnap.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => ({
            ...(doc.data() as Match),
            id: doc.id,
          }))
        )
      );

      const load: Load = {
        id: 'agent-query',
        origin,
        destination,
        cargo: 'Unspecified',
        weight: 0,
        status: 'Pending',
        requiredQualifications: [],
        pickupDate,
        ...(trailerType ? { trailerType: trailerType as Load['trailerType'] } : {}),
      };

      const ranked = findMatchingDrivers(load, pool, {
        onlyGreenCompliance: true,
        onlyAvailable: true,
        maxResults: 5,
        requestedWindow: window,
        commitments,
      });

      // Carrier names, so the answer names a company rather than an id.
      const carrierNames: Record<string, string> = {};
      for (const m of ranked) {
        const oid = (m.driver as Driver & { ownerId?: string }).ownerId;
        if (!oid || carrierNames[oid]) continue;
        const snap = await db.collection('owner_operators').doc(oid).get();
        const data = snap.exists ? (snap.data() as { legalName?: string; companyName?: string }) : {};
        carrierNames[oid] = data.legalName || data.companyName || 'Unnamed carrier';
      }

      return {
        blocked: false,
        candidates: ranked.map((m) => ({
          carrier: carrierNames[(m.driver as Driver & { ownerId?: string }).ownerId ?? ''] ?? 'Unnamed carrier',
          driverName: m.driver.name || 'Unnamed driver',
          location: m.driver.location || 'Unknown',
          score: m.score,
          complianceStatus: getComplianceStatus(m.driver),
          availability: m.availabilityVerdict ?? 'unknown',
          ...(m.availabilityDetail ? { availabilityDetail: m.availabilityDetail } : {}),
        })),
        total: ranked.length,
      };
    }
  );

  return [getMyDrivers, getMyLoads, findAvailableDrivers];
}
