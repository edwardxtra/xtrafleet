import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac } from 'crypto';

import {
  DEFAULT_SYNC_POLICY,
  applyOwnedFields,
  computeHmac,
  effectiveCapabilities,
  fieldOwner,
  findExternalRef,
  isStaleUpdate,
  isTmsProviderId,
  mergeExternalRef,
  normalizeExternalLoad,
  normalizeIsoDate,
  normalizeLoadStatus,
  normalizeTrailerType,
  pickBestAvailability,
  resolveAdapter,
  resetTmsRegistry,
  tmsConfidenceScore,
  verifyHmacSignature,
  type DriverAvailability,
  type ExternalLoad,
  type ExternalRef,
  type TmsConnection,
} from '../tms';
import {
  mockTmsAdapter,
  resetMockTmsData,
  failNextMockCall,
  mockTmsStore,
} from '../tms/adapters/mock';
import { tmsEventDocId } from '../tms/events';

const NOW = new Date('2026-04-15T12:00:00.000Z');

function makeConnection(overrides: Partial<TmsConnection> = {}): TmsConnection {
  return {
    id: 'conn-1',
    ownerOperatorId: 'oo-1',
    provider: 'mock',
    status: 'active',
    credentialRef: 'secret://tms/mock/conn-1',
    externalAccountId: 'MOCK-ACCT-1',
    grantedCapabilities: ['loads.pull', 'drivers.pull', 'availability.pull'],
    createdAt: NOW.toISOString(),
    ...overrides,
  };
}

function makeRef(overrides: Partial<ExternalRef> = {}): ExternalRef {
  return {
    provider: 'mock',
    connectionId: 'conn-1',
    externalId: 'EXT-1',
    syncedAt: NOW.toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  resetMockTmsData();
  resetTmsRegistry();
});

// ---------------------------------------------------------------------------
// Registry + capabilities
// ---------------------------------------------------------------------------

describe('registry', () => {
  it('resolves a registered adapter for a supported capability', () => {
    const result = resolveAdapter('mock', 'loads.pull');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.provider).toBe('mock');
  });

  it('distinguishes an unregistered provider from an unsupported capability', () => {
    const unregistered = resolveAdapter('mcleod', 'loads.pull');
    expect(unregistered.ok).toBe(false);
    if (!unregistered.ok) expect(unregistered.error.code).toBe('not_configured');

    const unsupported = resolveAdapter('mock', 'documents.push');
    expect(unsupported.ok).toBe(false);
    if (!unsupported.ok) expect(unsupported.error.code).toBe('unsupported');
  });

  it('never marks a configuration failure retryable', () => {
    const result = resolveAdapter('turvo', 'loads.pull');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.retryable).toBe(false);
  });

  it('intersects adapter capabilities with what the account granted', () => {
    const ctx = { connection: makeConnection() };
    const caps = effectiveCapabilities(ctx);
    // The mock adapter can push assignments, but this connection wasn't
    // granted that scope — so it isn't usable here.
    expect(caps).toContain('loads.pull');
    expect(caps).not.toContain('assignment.push');
  });

  it('recognizes only known provider ids', () => {
    expect(isTmsProviderId('mcleod')).toBe(true);
    expect(isTmsProviderId('definitely-not-a-tms')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The port: mock adapter
// ---------------------------------------------------------------------------

describe('mock adapter', () => {
  it('refuses to act on a connection that is not active', async () => {
    const ctx = { connection: makeConnection({ status: 'revoked' }) };
    const result = await mockTmsAdapter.listLoads!(ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('not_configured');
  });

  it('returns errors rather than throwing across the port', async () => {
    failNextMockCall('rate_limited', 'slow down');
    const result = await mockTmsAdapter.listLoads!({ connection: makeConnection() });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('rate_limited');
      expect(result.error.retryable).toBe(true);
    }
  });

  it('is idempotent when the same assignment is pushed twice', async () => {
    const ctx = { connection: makeConnection() };
    const assignment = {
      matchId: 'match-1',
      driverName: 'Ramona Alvarez',
      origin: 'Boston, MA',
      destination: 'Westborough, MA',
    };

    const first = await mockTmsAdapter.pushAssignment!(ctx, assignment);
    const second = await mockTmsAdapter.pushAssignment!(ctx, assignment);

    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.data.externalAssignmentId).toBe(first.data.externalAssignmentId);
    }
    expect(mockTmsStore().assignments.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Webhook signatures
// ---------------------------------------------------------------------------

describe('webhook signatures', () => {
  const secret = 'whsec_test';
  const body = JSON.stringify({ id: 'evt_1', type: 'load.updated' });
  const timestamp = Math.floor(NOW.getTime() / 1000);

  function sign(payloadBody: string, ts = timestamp) {
    return createHmac('sha256', secret).update(`${ts}.${payloadBody}`, 'utf8').digest('hex');
  }

  it('accepts a correctly signed payload', () => {
    const result = verifyHmacSignature({
      rawBody: body,
      signature: sign(body),
      secret,
      timestamp,
      now: () => NOW.getTime(),
    });
    expect(result.valid).toBe(true);
  });

  it('rejects a tampered body', () => {
    const result = verifyHmacSignature({
      rawBody: JSON.stringify({ id: 'evt_1', type: 'load.cancelled' }),
      signature: sign(body),
      secret,
      timestamp,
      now: () => NOW.getTime(),
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('signature_mismatch');
  });

  it('rejects a replayed request outside the tolerance window', () => {
    const old = timestamp - 3600;
    const result = verifyHmacSignature({
      rawBody: body,
      signature: sign(body, old),
      secret,
      timestamp: old,
      now: () => NOW.getTime(),
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('timestamp_out_of_tolerance');
  });

  it('rejects a signature of the wrong length without throwing', () => {
    const result = verifyHmacSignature({
      rawBody: body,
      signature: 'abcd',
      secret,
      timestamp,
      now: () => NOW.getTime(),
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('signature_mismatch');
  });

  it('tolerates a sha256= prefix', () => {
    const result = verifyHmacSignature({
      rawBody: body,
      signature: `sha256=${sign(body)}`,
      secret,
      timestamp,
      now: () => NOW.getTime(),
    });
    expect(result.valid).toBe(true);
  });

  it('signs the timestamp together with the body', () => {
    // Proves the timestamp can't be swapped independently of the payload.
    expect(computeHmac(`${timestamp}.${body}`, secret)).not.toBe(computeHmac(body, secret));
  });
});

describe('mock adapter parseWebhook', () => {
  const secret = 'whsec_test';

  async function deliver(payload: unknown, ts = Math.floor(Date.now() / 1000)) {
    const raw = JSON.stringify(payload);
    const signature = createHmac('sha256', secret).update(`${ts}.${raw}`, 'utf8').digest('hex');
    return mockTmsAdapter.parseWebhook!(
      raw,
      { 'x-mock-signature': signature, 'x-mock-timestamp': String(ts) },
      secret
    );
  }

  it('normalizes a signed event', async () => {
    const result = await deliver({
      id: 'evt_100',
      type: 'load.updated',
      occurredAt: NOW.toISOString(),
      externalId: 'MOCK-ORD-1001',
      data: { status: 'ASSIGNED' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.eventId).toBe('evt_100');
      expect(result.data.type).toBe('load.updated');
      expect(result.data.externalId).toBe('MOCK-ORD-1001');
    }
  });

  it('refuses an event with no idempotency key', async () => {
    const result = await deliver({ type: 'load.updated' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_response');
  });

  it('maps an unrecognized event type to "unknown" rather than guessing', async () => {
    const result = await deliver({ id: 'evt_101', type: 'invoice.posted' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.type).toBe('unknown');
  });

  it('rejects an unsigned delivery', async () => {
    const result = await mockTmsAdapter.parseWebhook!(
      JSON.stringify({ id: 'evt_102' }),
      {},
      secret
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.retryable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Event log ids
// ---------------------------------------------------------------------------

describe('tmsEventDocId', () => {
  it('namespaces by provider so two systems can share an event id', () => {
    expect(tmsEventDocId('mock', 'evt_1')).not.toBe(tmsEventDocId('mcleod', 'evt_1'));
  });

  it('strips characters Firestore cannot store in a document id', () => {
    expect(tmsEventDocId('mock', 'a/b#c')).toBe('mock__a_b_c');
  });

  it('is deterministic — the same delivery always maps to the same id', () => {
    expect(tmsEventDocId('mock', 'evt_1')).toBe(tmsEventDocId('mock', 'evt_1'));
  });
});

// ---------------------------------------------------------------------------
// External refs and staleness
// ---------------------------------------------------------------------------

describe('external refs', () => {
  it('replaces the ref for the same connection instead of duplicating it', () => {
    const first = makeRef({ externalId: 'EXT-1' });
    const updated = makeRef({ externalId: 'EXT-1', externalVersion: '2' });
    const refs = mergeExternalRef(mergeExternalRef(undefined, first), updated);
    expect(refs).toHaveLength(1);
    expect(refs[0].externalVersion).toBe('2');
  });

  it('keeps refs from different systems side by side', () => {
    const refs = mergeExternalRef(
      [makeRef()],
      makeRef({ provider: 'mcleod', connectionId: 'conn-2', externalId: 'ORD-9' })
    );
    expect(refs).toHaveLength(2);
    expect(findExternalRef(refs, 'mcleod')?.externalId).toBe('ORD-9');
  });

  it('drops an out-of-order update by version', () => {
    const current = makeRef({ externalVersion: '5' });
    expect(isStaleUpdate(current, { externalVersion: '4' })).toBe(true);
    expect(isStaleUpdate(current, { externalVersion: '6' })).toBe(false);
  });

  it('falls back to timestamps when the provider has no version', () => {
    const current = makeRef({ syncedAt: '2026-04-15T12:00:00.000Z' });
    expect(isStaleUpdate(current, { syncedAt: '2026-04-15T11:00:00.000Z' })).toBe(true);
    expect(isStaleUpdate(current, { syncedAt: '2026-04-15T13:00:00.000Z' })).toBe(false);
  });

  it('accepts the first sighting of a record', () => {
    expect(isStaleUpdate(undefined, { externalVersion: '1' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Field ownership
// ---------------------------------------------------------------------------

describe('field ownership', () => {
  it('lets the TMS own operational fields', () => {
    expect(fieldOwner('status')).toBe('tms');
    expect(fieldOwner('pickupDate')).toBe('tms');
  });

  it('keeps commercial fields with XtraFleet', () => {
    expect(fieldOwner('price')).toBe('xtrafleet');
  });

  it('defaults unlisted fields to XtraFleet so a new integration cannot widen its own scope', () => {
    expect(fieldOwner('cargo', DEFAULT_SYNC_POLICY)).toBe('xtrafleet');
  });

  it('applies owned fields and reports the rest as conflicts rather than dropping them', () => {
    const { merged, applied, rejected } = applyOwnedFields(
      { status: 'Pending', price: 800, cargo: 'Retail Goods' },
      { status: 'Matched', price: 900 }
    );
    expect(merged.status).toBe('Matched');
    expect(merged.price).toBe(800);
    expect(applied).toEqual(['status']);
    expect(rejected).toEqual(['price']);
  });

  it('ignores undefined values in a patch', () => {
    const { applied, rejected } = applyOwnedFields(
      { status: 'Pending' },
      { status: undefined }
    );
    expect(applied).toEqual([]);
    expect(rejected).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Value normalization
// ---------------------------------------------------------------------------

describe('value normalization', () => {
  it('maps common equipment spellings onto TrailerType', () => {
    expect(normalizeTrailerType('Dry Van')).toBe('dry-van');
    expect(normalizeTrailerType('DV')).toBe('dry-van');
    expect(normalizeTrailerType('refrigerated')).toBe('reefer');
    expect(normalizeTrailerType('drop deck')).toBe('step-deck');
  });

  it('returns undefined for equipment it does not recognize', () => {
    expect(normalizeTrailerType('conestoga-quad')).toBeUndefined();
  });

  it('maps provider load statuses onto ours', () => {
    expect(normalizeLoadStatus('AVAILABLE')).toBe('Pending');
    expect(normalizeLoadStatus('in-transit')).toBe('In-transit');
    expect(normalizeLoadStatus('DELIVERED')).toBe('Delivered');
  });

  it('refuses to guess an unrecognized status', () => {
    expect(normalizeLoadStatus('ON_HOLD_BILLING')).toBeUndefined();
  });

  it('rejects unparseable dates instead of producing an invalid one', () => {
    expect(normalizeIsoDate('not a date')).toBeUndefined();
    expect(normalizeIsoDate('2026-04-15')).toBe('2026-04-15T00:00:00.000Z');
  });
});

describe('normalizeExternalLoad', () => {
  const external: ExternalLoad = {
    externalId: 'MOCK-ORD-1001',
    externalVersion: '3',
    origin: 'Conley Terminal, 940 East First St, Boston, MA 02127',
    destination: '100 Distribution Way, Westborough, MA 01581',
    cargo: 'Retail Goods',
    weightLbs: 38000,
    trailerType: 'Dry Van',
    pickupDate: '2026-04-15T18:00:00.000Z',
    rate: 850,
    status: 'AVAILABLE',
  };

  it('produces a draft with an external ref and no owner or id', () => {
    const { draft } = normalizeExternalLoad(external, {
      provider: 'mock',
      connectionId: 'conn-1',
      syncedAt: NOW.toISOString(),
    });

    expect(draft.origin).toBe(external.origin);
    expect(draft.trailerType).toBe('dry-van');
    expect(draft.status).toBe('Pending');
    expect(draft.externalRefs[0].externalId).toBe('MOCK-ORD-1001');
    expect(draft.externalRefs[0].externalVersion).toBe('3');
    expect('id' in draft).toBe(false);
    expect(draft.ownerId).toBeUndefined();
  });

  it('does not copy the provider rate into driver pay', () => {
    const { draft } = normalizeExternalLoad(external, {
      provider: 'mock',
      connectionId: 'conn-1',
      syncedAt: NOW.toISOString(),
    });
    // A TMS "rate" is usually the broker's linehaul, not what the driver
    // takes home. Mapping it needs a per-customer decision.
    expect(draft.price).toBeUndefined();
  });

  it('resolves a known origin address to a transport node', () => {
    const { draft } = normalizeExternalLoad(external, {
      provider: 'mock',
      connectionId: 'conn-1',
      syncedAt: NOW.toISOString(),
    });
    expect(draft.originNodeId).toBeDefined();
  });

  it('reports fields it could not map so a human can review before go-live', () => {
    const { draft, unmapped } = normalizeExternalLoad(
      { ...external, trailerType: 'quad-axle-conestoga', status: 'ON_HOLD_BILLING' },
      { provider: 'mock', connectionId: 'conn-1', syncedAt: NOW.toISOString() }
    );
    expect(unmapped).toContain('trailerType');
    expect(unmapped).toContain('status');
    // Unmappable status must not become "live" by accident.
    expect(draft.status).toBe('Pending');
  });
});

// ---------------------------------------------------------------------------
// Availability confidence (DEV-155 scoring term W6)
// ---------------------------------------------------------------------------

describe('tmsConfidenceScore', () => {
  function availability(overrides: Partial<DriverAvailability> = {}): DriverAvailability {
    return {
      source: 'tms',
      status: 'available',
      observedAt: NOW.toISOString(),
      ...overrides,
    };
  }

  it('scores a fresh live integration at 100 and manual entry at 60', () => {
    expect(tmsConfidenceScore(availability({ source: 'tms' }), NOW)).toBe(100);
    expect(tmsConfidenceScore(availability({ source: 'manual' }), NOW)).toBe(60);
  });

  it('decays with staleness so an old TMS reading is not trusted blindly', () => {
    const sixHoursAgo = new Date(NOW.getTime() - 6 * 3_600_000).toISOString();
    const stale = tmsConfidenceScore(availability({ observedAt: sixHoursAgo }), NOW);
    expect(stale).toBeLessThan(100);
    expect(stale).toBeGreaterThan(25);
  });

  it('floors decay rather than reaching zero', () => {
    const ancient = new Date(NOW.getTime() - 72 * 3_600_000).toISOString();
    expect(tmsConfidenceScore(availability({ observedAt: ancient }), NOW)).toBe(25);
  });

  it('penalizes an unparseable observation time instead of trusting it', () => {
    expect(tmsConfidenceScore(availability({ observedAt: 'whenever' }), NOW)).toBe(50);
  });

  it('prefers a fresh manual entry over a badly stale TMS reading', () => {
    const staleTms = availability({
      source: 'tms',
      observedAt: new Date(NOW.getTime() - 24 * 3_600_000).toISOString(),
    });
    const freshManual = availability({ source: 'manual' });
    expect(pickBestAvailability([staleTms, freshManual], NOW)).toBe(freshManual);
  });

  it('breaks confidence ties toward the more recent observation', () => {
    const older = availability({ observedAt: new Date(NOW.getTime() - 1000).toISOString() });
    const newer = availability({ observedAt: NOW.toISOString() });
    expect(pickBestAvailability([older, newer], NOW)).toBe(newer);
  });

  it('returns undefined when there is nothing to pick', () => {
    expect(pickBestAvailability([], NOW)).toBeUndefined();
  });
});
