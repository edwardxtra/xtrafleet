/**
 * TMS integration port — canonical types (DEV-155).
 *
 * XtraFleet does not integrate with any TMS yet. This file defines the
 * *port*: the narrow, provider-agnostic contract every future TMS adapter
 * (McLeod, TMW/Trimble, Turvo, Samsara, Motive, …) has to satisfy.
 *
 * Why build the port before the first integration exists:
 *
 *   1. The expensive, invasive parts of a TMS integration are not the API
 *      clients — they are the *record-level* concerns: stable external ids,
 *      provenance ("who owns this field"), idempotent inbound events, and
 *      conflict policy. Those touch `loads`, `drivers` and `matches`, so
 *      adding them now (as optional fields) is cheap; retrofitting them
 *      across live data later is not.
 *
 *   2. DEV-155's match scoring formula already has a "TMS Confidence Score"
 *      term. That term needs a `DriverAvailability` record carrying a
 *      `source` and a `confidence` — which we can populate from manual
 *      input today and from a real TMS later without touching the scorer.
 *
 * Deliberately NOT in here yet: provider SDKs, credential encryption, HOS
 * polling schedules, per-provider field maps. See docs/TMS_INTEGRATION.md
 * for what we chose to defer and why.
 */

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

/**
 * Systems we expect to talk to. `mock` is the in-repo reference
 * implementation used by tests and local development — it is a real member
 * of this union on purpose, so the "no provider configured" path is always
 * exercised by something.
 */
export const TMS_PROVIDERS = [
  'mock',
  'mcleod',
  'trimble',   // TMW / Trimble Transportation
  'turvo',
  'samsara',   // ELD-first, but exposes dispatch + HOS
  'motive',    // formerly KeepTruckin
] as const;

export type TmsProviderId = (typeof TMS_PROVIDERS)[number];

export function isTmsProviderId(value: string): value is TmsProviderId {
  return (TMS_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Not every TMS does everything. A provider declares what it can do and the
 * UI/scheduler degrades accordingly rather than failing at call time.
 */
export type TmsCapability =
  | 'loads.pull'          // read loads/orders out of the TMS
  | 'drivers.pull'        // read the driver roster
  | 'availability.pull'   // driver availability windows
  | 'hos.pull'            // hours-of-service remaining
  | 'assignment.push'     // write an XtraFleet match back as a TMS assignment
  | 'status.push'         // write trip status transitions back
  | 'documents.push'      // push the signed TLA / BOL as an attachment
  | 'webhooks';           // provider can call us instead of us polling

// ---------------------------------------------------------------------------
// Result envelope — nothing crosses this port by throwing
// ---------------------------------------------------------------------------

export type TmsErrorCode =
  | 'auth'              // credentials rejected / expired
  | 'rate_limited'
  | 'not_found'
  | 'unsupported'       // adapter doesn't declare the capability
  | 'invalid_response'  // upstream returned something we can't normalize
  | 'upstream'          // provider 5xx
  | 'timeout'
  | 'not_configured';   // no connection/secret for this provider

export interface TmsError {
  code: TmsErrorCode;
  message: string;
  /** Safe to retry with backoff. Callers use this to decide dead-letter vs requeue. */
  retryable: boolean;
  /** Provider's own error code/id, for support tickets. Never a credential. */
  providerCode?: string;
}

export type TmsResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: TmsError };

export function tmsOk<T>(data: T): TmsResult<T> {
  return { ok: true, data };
}

export function tmsErr<T = never>(
  code: TmsErrorCode,
  message: string,
  opts?: { retryable?: boolean; providerCode?: string }
): TmsResult<T> {
  return {
    ok: false,
    error: {
      code,
      message,
      // Transient classes retry by default; the rest don't.
      retryable:
        opts?.retryable ??
        (code === 'rate_limited' || code === 'upstream' || code === 'timeout'),
      providerCode: opts?.providerCode,
    },
  };
}

// ---------------------------------------------------------------------------
// Provenance: external ids and field ownership
// ---------------------------------------------------------------------------

/**
 * A pointer from an XtraFleet record to its counterpart in an external
 * system. Records can carry several (a load can exist in a shipper's TMS
 * *and* a broker's).
 */
export interface ExternalRef {
  provider: TmsProviderId;
  /** The connection this ref came through — providers are multi-tenant. */
  connectionId: string;
  /** The id as the provider knows it. Opaque; never parsed. */
  externalId: string;
  /** Deep link into the provider UI, when it has stable URLs. */
  url?: string;
  /** ISO timestamp of the last successful read/write for this ref. */
  syncedAt: string;
  /**
   * Provider-supplied version/etag/updated-at, when available. Used to drop
   * out-of-order webhook deliveries instead of clobbering newer data.
   */
  externalVersion?: string;
}

/**
 * Which system is authoritative for a given field.
 *
 * DEV-155: "TMS override takes precedence over manual input." That is a
 * *policy*, not a law of nature — a dispatcher editing a rate in XtraFleet
 * shouldn't be silently overwritten on the next poll. So ownership is
 * recorded per field and the sync layer consults it.
 */
export type FieldOwner = 'xtrafleet' | 'tms';

export interface SyncPolicy {
  /** Default owner for fields not listed below. */
  defaultOwner: FieldOwner;
  /** Field paths the TMS always wins on (e.g. 'status', 'pickupDate'). */
  tmsOwnedFields?: readonly string[];
  /** Field paths XtraFleet always wins on (e.g. 'price' once a TLA exists). */
  xtrafleetOwnedFields?: readonly string[];
}

export const DEFAULT_SYNC_POLICY: SyncPolicy = {
  // Conservative: we only accept what a provider explicitly owns. A new
  // integration can't quietly start rewriting fields it wasn't scoped for.
  defaultOwner: 'xtrafleet',
  tmsOwnedFields: ['status', 'pickupDate', 'estimatedDeliveryDate'],
  xtrafleetOwnedFields: ['price', 'driverCompensation'],
};

// ---------------------------------------------------------------------------
// Connections — one per (owner-operator, provider) pair
// ---------------------------------------------------------------------------

export type TmsConnectionStatus =
  | 'pending'      // created, credentials not yet verified
  | 'active'
  | 'degraded'     // last call failed but credentials still look valid
  | 'revoked'      // provider or user disconnected it
  | 'error';       // credentials rejected; needs human intervention

/**
 * Stored in the `tms_connections` collection. Server-only (see
 * firestore.rules) — clients never read it, because even the non-secret
 * fields describe a customer's back-office topology.
 *
 * Note there is no credential on this document. Secrets live in Secret
 * Manager / env; this holds only a *reference* to them, so a Firestore
 * export can never leak a TMS password.
 */
export interface TmsConnection {
  id: string;
  ownerOperatorId: string;
  provider: TmsProviderId;
  status: TmsConnectionStatus;
  /** Human label chosen by the customer ("McLeod – Boston yard"). */
  label?: string;
  /** Key into the secret store. NOT the secret. */
  credentialRef: string;
  /** Provider account/tenant id, for support and webhook routing. */
  externalAccountId?: string;
  /** Capabilities actually granted by this account's scopes/licence. */
  grantedCapabilities: TmsCapability[];
  syncPolicy?: SyncPolicy;
  lastSyncAt?: string;
  lastErrorAt?: string;
  lastErrorMessage?: string;
  createdAt: string;
  updatedAt?: string;
}

/**
 * What an adapter call receives. The adapter resolves `credentialRef`
 * itself — callers never handle secrets.
 */
export interface TmsContext {
  connection: TmsConnection;
  /** Abort long upstream calls; every adapter must honour it. */
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Normalized inbound shapes
// ---------------------------------------------------------------------------

/**
 * A load as it arrives from a TMS, normalized to XtraFleet vocabulary but
 * not yet an XtraFleet `Load` — it has no owner, no id, and may be missing
 * fields we require. `normalize.ts` turns this into a draft Load.
 */
export interface ExternalLoad {
  externalId: string;
  externalVersion?: string;
  origin: string;
  destination: string;
  cargo?: string;
  weightLbs?: number;
  trailerType?: string;
  loadType?: string;
  pickupDate?: string;          // ISO
  estimatedDeliveryDate?: string; // ISO
  /** Rate the TMS carries, in dollars. May be broker rate, not driver pay. */
  rate?: number;
  referenceNumber?: string;     // PRO / BOL / order number
  status?: string;              // provider vocabulary; mapped in normalize.ts
  /** Anything we didn't model. Kept for debugging; never read by app code. */
  raw?: Record<string, unknown>;
}

export interface ExternalDriver {
  externalId: string;
  externalVersion?: string;
  name: string;
  email?: string;
  phone?: string;
  cdlNumber?: string;
  cdlState?: string;
  homeTerminal?: string;
  raw?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Driver availability — the input to DEV-155's "TMS Confidence Score"
// ---------------------------------------------------------------------------

export type AvailabilityStatus =
  | 'available'
  | 'reserved'
  | 'in_transit'
  | 'off_duty'
  | 'unknown';

export type AvailabilitySource =
  | 'tms'       // live integration
  | 'eld'       // ELD/telematics feed
  | 'manual'    // a human typed it into XtraFleet
  | 'inferred'; // derived from our own match/TLA state

export interface DriverAvailability {
  /** XtraFleet driver id. Absent when we haven't reconciled the driver yet. */
  driverId?: string;
  externalDriverId?: string;
  provider?: TmsProviderId;
  connectionId?: string;
  source: AvailabilitySource;
  status: AvailabilityStatus;
  /** Transport node id from src/lib/nodes.ts, when resolvable. */
  currentNodeId?: string;
  currentLocation?: string;
  availableFrom?: string;  // ISO
  availableUntil?: string; // ISO
  hosRemainingHours?: number;
  /** When the *source* observed this, not when we stored it. */
  observedAt: string;
}

// ---------------------------------------------------------------------------
// Outbound shapes
// ---------------------------------------------------------------------------

/** DEV-155 Feature 4.3 — push an accepted match into the customer's TMS. */
export interface AssignmentPush {
  matchId: string;
  /** External id of the load in the provider, when it originated there. */
  externalLoadId?: string;
  externalDriverId?: string;
  driverName: string;
  origin: string;
  destination: string;
  pickupDate?: string;
  rate?: number;
  /** Signed TLA, when the provider accepts document attachments. */
  documentUrl?: string;
}

export interface AssignmentAck {
  externalAssignmentId: string;
  url?: string;
}

export type TripStatus =
  | 'assigned'
  | 'at_pickup'
  | 'loaded'
  | 'in_transit'
  | 'at_delivery'
  | 'delivered'
  | 'cancelled';

export interface StatusPush {
  externalAssignmentId: string;
  status: TripStatus;
  occurredAt: string;
  location?: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Inbound webhook parse result
// ---------------------------------------------------------------------------

export type TmsEventType =
  | 'load.created'
  | 'load.updated'
  | 'load.cancelled'
  | 'driver.updated'
  | 'availability.updated'
  | 'assignment.updated'
  | 'unknown';

export interface TmsEvent {
  /**
   * Provider's own event id. This is the idempotency key — a provider that
   * doesn't supply one forces us to hash the payload instead, which is
   * strictly worse, so ask for one during integration scoping.
   */
  eventId: string;
  type: TmsEventType;
  occurredAt: string;
  /** External id of the subject record, when the event names one. */
  externalId?: string;
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// The port itself
// ---------------------------------------------------------------------------

/**
 * Every method is optional except the two that describe the adapter. Call
 * sites must check `supports()` (or use `requireCapability` in registry.ts)
 * rather than assuming a method exists.
 */
export interface TmsAdapter {
  readonly provider: TmsProviderId;
  readonly capabilities: readonly TmsCapability[];

  /** Cheap credential check used at connect time and by the health probe. */
  verifyConnection(ctx: TmsContext): Promise<TmsResult<{ accountId?: string }>>;

  listLoads?(
    ctx: TmsContext,
    query?: { updatedSince?: string; limit?: number }
  ): Promise<TmsResult<ExternalLoad[]>>;

  listDrivers?(
    ctx: TmsContext,
    query?: { updatedSince?: string; limit?: number }
  ): Promise<TmsResult<ExternalDriver[]>>;

  getDriverAvailability?(
    ctx: TmsContext,
    externalDriverIds?: string[]
  ): Promise<TmsResult<DriverAvailability[]>>;

  pushAssignment?(
    ctx: TmsContext,
    assignment: AssignmentPush
  ): Promise<TmsResult<AssignmentAck>>;

  pushStatus?(ctx: TmsContext, update: StatusPush): Promise<TmsResult<void>>;

  /**
   * Verify the signature and normalize the body. Given the raw body (not a
   * parsed object) because signatures are computed over exact bytes.
   */
  parseWebhook?(
    rawBody: string,
    headers: Record<string, string>,
    secret: string
  ): Promise<TmsResult<TmsEvent>>;
}
