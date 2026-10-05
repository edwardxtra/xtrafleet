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
import type { Driver, Load } from '@/lib/data';

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

  return [getMyDrivers, getMyLoads];
}
