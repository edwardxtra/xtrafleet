# TMS Integration Architecture

**Status:** foundation merged, no live integration. Nothing in this document
describes a connection that exists today.

**Source ticket:** [DEV-155](https://xtrafleet-team.atlassian.net/browse/DEV-155)
— "TMS-integrated workflows" is one of the four pillars of the matching
strategy, alongside corridor-first GTM, transport nodes, and pre-cleared
driver pools.

---

## Why build this before we have a TMS partner

The tempting answer is "wait until we sign one — otherwise we're guessing at
an abstraction." That is right about the *adapters* and wrong about
everything else.

The expensive parts of a TMS integration are not API clients. They are the
record-level concerns that touch `loads`, `drivers`, and `matches`:

| Concern | Cost if built now | Cost if retrofitted later |
|---|---|---|
| External ids on core records | An optional field | Backfill across live data, with no source of truth for what the ids were |
| Field ownership ("who wins") | A lookup table | A support queue full of "the TMS overwrote my rate" |
| Idempotent inbound events | A document id convention | Duplicate assignments, double-booked drivers |
| Availability provenance | A `source` + `confidence` pair | Rewriting the scorer, which by then has tuned weights |

So the split is: **build the record-level plumbing now, defer the
provider-specific work.** The port below is narrow enough that getting it
wrong costs a day; the plumbing is invasive enough that getting it late costs
a migration.

The second reason is commercial. Handing a prospective TMS partner a webhook
URL, a signed-payload spec, and a working reference implementation during
scoping is a materially different conversation from "we'll build something."

---

## What is in the repo

```
src/lib/tms/
  types.ts          The port: adapter interface, result envelope, domain shapes
  registry.ts       Adapter lookup + capability guard
  normalize.ts      Value mapping, provenance, conflict policy, confidence scoring
  signature.ts      HMAC webhook verification (shared across providers)
  connections.ts    tms_connections store (server-only)
  events.ts         Idempotent inbound event log (server-only)
  adapters/mock.ts  Reference implementation
src/app/api/tms/[provider]/webhook/route.ts
```

Import from `@/lib/tms`. `events` and `connections` are deliberately not
re-exported from the barrel — they pull in `firebase-admin`, which must never
reach a client bundle.

### 1. The port (`types.ts`)

Every provider implements `TmsAdapter`. Only `provider`, `capabilities`, and
`verifyConnection` are required; everything else is optional and gated by a
declared capability, because no two TMS products expose the same surface.

```ts
interface TmsAdapter {
  readonly provider: TmsProviderId;
  readonly capabilities: readonly TmsCapability[];
  verifyConnection(ctx): Promise<TmsResult<{ accountId?: string }>>;
  listLoads?(ctx, query): Promise<TmsResult<ExternalLoad[]>>;
  getDriverAvailability?(ctx, ids): Promise<TmsResult<DriverAvailability[]>>;
  pushAssignment?(ctx, assignment): Promise<TmsResult<AssignmentAck>>;
  pushStatus?(ctx, update): Promise<TmsResult<void>>;
  parseWebhook?(rawBody, headers, secret): Promise<TmsResult<TmsEvent>>;
}
```

Two rules the port enforces:

- **Nothing throws across the boundary.** Every call returns
  `TmsResult<T>` — `{ ok: true, data }` or `{ ok: false, error }` — and every
  error carries a `retryable` flag. A sync worker needs to distinguish "retry
  with backoff" from "dead-letter this and page someone", and an exception
  hierarchy makes that a `instanceof` maze.
- **Capabilities are declared, not discovered.** `resolveAdapter(provider,
  capability)` returns `not_configured` for an unknown provider and
  `unsupported` for a known one that can't do the thing. The UI renders the
  second as a disabled feature rather than an error.

`effectiveCapabilities(ctx)` intersects what the adapter can do with what the
customer's account actually granted — a TMS licence without the dispatch API
is, from our side, identical to a TMS that doesn't have one.

### 2. Provenance (`normalize.ts`)

`Load` and `Driver` gained an optional `externalRefs?: ExternalRef[]`. A
record can carry several: the same shipment routinely exists in both a
shipper's and a broker's TMS, keyed differently in each.

```ts
interface ExternalRef {
  provider: TmsProviderId;
  connectionId: string;      // providers are multi-tenant
  externalId: string;
  syncedAt: string;
  externalVersion?: string;  // etag / updated-at, for ordering
}
```

`isStaleUpdate()` uses `externalVersion` (falling back to `syncedAt`) to drop
out-of-order deliveries. Webhooks arrive out of order routinely — a retried
10:00 update landing after the 10:05 one is normal, and without this it
silently reverts a load.

### 3. Field ownership

DEV-155 says "TMS override takes precedence over manual input." That's a
policy, not a law: a dispatcher who edits a rate in XtraFleet should not be
silently overwritten on the next poll. So ownership is per field:

```ts
DEFAULT_SYNC_POLICY = {
  defaultOwner: 'xtrafleet',
  tmsOwnedFields: ['status', 'pickupDate', 'estimatedDeliveryDate'],
  xtrafleetOwnedFields: ['price', 'driverCompensation'],
};
```

The default is `xtrafleet`, so a new integration cannot quietly start
rewriting fields nobody scoped it for. `applyOwnedFields()` returns the
merged record *plus* the rejected fields, so a conflict can surface as "your
TMS wants to change this rate to $900 — accept?" rather than a silent drop.
Silent drops are how integrations lose people's trust.

### 4. Availability and the confidence score

DEV-155's scoring formula has a `W6 * TMS Confidence Score` term. It needs a
`DriverAvailability` record carrying `source` (`tms` / `eld` / `manual` /
`inferred`) and an observation time. `tmsConfidenceScore()` starts from the
source ceiling (DEV-155: live integration 100, manual 60) and decays with
staleness to a 25% floor.

Decay matters: a TMS reading from six hours ago is not worth more than a
dispatcher who typed something in ten minutes ago. Without it, "high
confidence" would mean "a driver who is already 200 miles away."

This is the piece with value *before* any TMS exists — manual availability
entry can populate it today, and the scorer never has to change when a real
feed replaces it.

### 5. Inbound events

`POST /api/tms/{provider}/webhook` does exactly four things: verify → dedupe
→ store → 202. No business logic.

- **Inert until configured.** With no `TMS_WEBHOOK_SECRET_<PROVIDER>` set it
  returns 501 and never touches the database. Merging it ahead of any signed
  integration adds no live attack surface.
- **Idempotency by document id.** The `tms_events` document id *is* the
  provider's event id (namespaced and sanitized), written with `create()`,
  not `set()` — so a duplicate delivery fails at the database rather than in a
  read-then-write race where two concurrent retries both see "not found".
  This is the same lesson `src/app/api/stripe/webhooks/route.ts` learned in
  DEV-84.
- **Processing is out of band.** A provider that times out retries, and a
  retry that re-runs half-finished work is worse than a delayed one.
- **Payloads are kept.** When a mapping bug corrupts records, the fix is to
  correct the mapper and replay — only possible if we stored the raw event.

An event with no provider-supplied id is rejected rather than processed: we
cannot dedupe it. **Ask every provider for an event id during scoping.**

### 6. Secrets

`tms_connections` holds a `credentialRef` — a pointer into Secret Manager —
never a credential. A Firestore export, a backup, or a future "let admins
view a customer's config" screen therefore cannot leak a TMS password. Both
`tms_connections` and `tms_events` are `allow read, write: if false` in
`firestore.rules`; all access is server-side via the Admin SDK.

---

## Deliberately deferred

- **Provider SDKs and per-provider field maps.** Every one is guesswork until
  we have sandbox credentials and real payloads.
- **Sync scheduler / worker.** The port supports polling, but scheduling,
  backoff, and dead-letter handling depend on the provider's rate limits.
- **Reconciliation UI.** `applyOwnedFields` reports conflicts; nothing
  renders them yet.
- **Credential encryption mechanics.** `credentialRef` names the seam;
  choosing Secret Manager vs. an encrypted field is a decision for the first
  integration.
- **Auto-import of external loads.** `normalizeExternalLoad` produces a
  *draft* — no owner, no id, and `status: 'Pending'` when anything failed to
  map. A load must not go live because a mapper guessed.
- **HOS/ELD polling cadence.** Shapes exist; the schedule is provider policy.

---

## Adding a real provider

1. Get sandbox credentials and **real** payload samples. Do not write the
   mapper from the docs.
2. Add `src/lib/tms/adapters/<provider>.ts` implementing `TmsAdapter`.
   Declare only the capabilities you have actually exercised.
3. Register it in `registry.ts` (explicit registration — no dynamic scanning,
   which would drag every SDK into every Next.js bundle).
4. Extend the alias tables in `normalize.ts` for that provider's equipment
   and status vocabularies. Anything unrecognized must stay `undefined`; the
   load then lands as a draft for a human. Never guess a status.
5. Set `TMS_WEBHOOK_SECRET_<PROVIDER>` in `apphosting.qa.yaml` first, and
   give the provider the QA webhook URL.
6. Write the adapter's tests against `src/lib/__tests__/tms.test.ts`'s
   patterns — signature rejection, duplicate delivery, out-of-order update,
   unmappable field.

The mock adapter (`adapters/mock.ts`) is the executable specification: it
implements every method, signs webhooks the way a real provider would, and
can inject failures via `failNextMockCall()` for exercising retry paths. Read
it before writing a new one.
