/**
 * Reference TMS adapter (DEV-155).
 *
 * Not a stub for a real product — it is the executable specification of the
 * port. It exercises every method, returns realistic Boston-corridor data
 * that lines up with the node catalog in src/lib/nodes.ts, and signs its
 * webhooks the same way a real provider would.
 *
 * Three jobs:
 *   1. Unit tests run against it instead of mocking the port.
 *   2. The availability/normalization plumbing can be wired into matching
 *      and demoed on QA before any commercial integration is signed.
 *   3. It proves the port is actually implementable — an interface no one
 *      has implemented is a guess.
 */

import type {
  AssignmentAck,
  AssignmentPush,
  DriverAvailability,
  ExternalDriver,
  ExternalLoad,
  StatusPush,
  TmsAdapter,
  TmsContext,
  TmsEvent,
  TmsEventType,
  TmsResult,
} from '../types';
import { tmsErr, tmsOk } from '../types';
import { verifyHmacSignature } from '../signature';

/** Mutable so tests can stage fixtures; reset with `resetMockTmsData()`. */
interface MockStore {
  loads: ExternalLoad[];
  drivers: ExternalDriver[];
  availability: DriverAvailability[];
  assignments: Map<string, AssignmentPush>;
  statuses: StatusPush[];
  failNext?: { code: Parameters<typeof tmsErr>[0]; message: string };
}

function seed(): MockStore {
  const now = new Date('2026-04-15T12:00:00.000Z');
  const iso = (hoursFromNow: number) =>
    new Date(now.getTime() + hoursFromNow * 3_600_000).toISOString();

  return {
    loads: [
      {
        externalId: 'MOCK-ORD-1001',
        externalVersion: '3',
        origin: 'Conley Terminal, 940 East First St, Boston, MA 02127',
        destination: '100 Distribution Way, Westborough, MA 01581',
        cargo: 'Retail Goods',
        weightLbs: 38000,
        trailerType: 'Dry Van',
        loadType: 'retail-goods',
        pickupDate: iso(6),
        estimatedDeliveryDate: iso(12),
        rate: 850,
        referenceNumber: 'PRO-778812',
        status: 'AVAILABLE',
      },
      {
        externalId: 'MOCK-ORD-1002',
        externalVersion: '1',
        origin: '55 Rail Yard Rd, Ayer, MA 01432',
        destination: 'Conley Terminal, 940 East First St, Boston, MA 02127',
        cargo: 'Paper Products',
        weightLbs: 41200,
        trailerType: 'Dry Van',
        loadType: 'paper-products',
        pickupDate: iso(20),
        rate: 620,
        referenceNumber: 'PRO-778840',
        status: 'AVAILABLE',
      },
    ],
    drivers: [
      {
        externalId: 'MOCK-DRV-77',
        name: 'Ramona Alvarez',
        email: 'ramona@example.test',
        cdlNumber: 'S1234567',
        cdlState: 'MA',
        homeTerminal: 'Boston, MA',
      },
    ],
    availability: [
      {
        externalDriverId: 'MOCK-DRV-77',
        provider: 'mock',
        source: 'tms',
        status: 'available',
        currentNodeId: 'node-conley-terminal',
        currentLocation: 'Boston, MA',
        availableFrom: iso(2),
        availableUntil: iso(14),
        hosRemainingHours: 8.5,
        observedAt: now.toISOString(),
      },
    ],
    assignments: new Map(),
    statuses: [],
  };
}

let store: MockStore = seed();

export function resetMockTmsData(): void {
  store = seed();
}

export function mockTmsStore(): MockStore {
  return store;
}

/** Force the next call to fail — for exercising retry/dead-letter paths. */
export function failNextMockCall(
  code: Parameters<typeof tmsErr>[0],
  message = 'injected failure'
): void {
  store.failNext = { code, message };
}

function takeInjectedFailure<T>(): TmsResult<T> | undefined {
  if (!store.failNext) return undefined;
  const { code, message } = store.failNext;
  store.failNext = undefined;
  return tmsErr<T>(code, message);
}

function connected<T>(ctx: TmsContext): TmsResult<T> | undefined {
  const injected = takeInjectedFailure<T>();
  if (injected) return injected;
  if (ctx.connection.status !== 'active') {
    return tmsErr<T>(
      'not_configured',
      `Connection ${ctx.connection.id} is "${ctx.connection.status}", not active`,
      { retryable: false }
    );
  }
  if (ctx.signal?.aborted) {
    return tmsErr<T>('timeout', 'Aborted before dispatch');
  }
  return undefined;
}

const MOCK_EVENT_TYPES: readonly string[] = [
  'load.created',
  'load.updated',
  'load.cancelled',
  'driver.updated',
  'availability.updated',
  'assignment.updated',
];

export const mockTmsAdapter: TmsAdapter = {
  provider: 'mock',

  capabilities: [
    'loads.pull',
    'drivers.pull',
    'availability.pull',
    'hos.pull',
    'assignment.push',
    'status.push',
    'webhooks',
  ],

  async verifyConnection(ctx) {
    const failed = connected<{ accountId?: string }>(ctx);
    if (failed) return failed;
    return tmsOk({ accountId: ctx.connection.externalAccountId ?? 'MOCK-ACCT-1' });
  },

  async listLoads(ctx, query) {
    const failed = connected<ExternalLoad[]>(ctx);
    if (failed) return failed;
    const limit = query?.limit ?? store.loads.length;
    return tmsOk(store.loads.slice(0, limit));
  },

  async listDrivers(ctx, query) {
    const failed = connected<ExternalDriver[]>(ctx);
    if (failed) return failed;
    const limit = query?.limit ?? store.drivers.length;
    return tmsOk(store.drivers.slice(0, limit));
  },

  async getDriverAvailability(ctx, externalDriverIds) {
    const failed = connected<DriverAvailability[]>(ctx);
    if (failed) return failed;
    if (!externalDriverIds?.length) return tmsOk(store.availability);
    const wanted = new Set(externalDriverIds);
    return tmsOk(
      store.availability.filter(
        (a) => a.externalDriverId && wanted.has(a.externalDriverId)
      )
    );
  },

  async pushAssignment(ctx, assignment) {
    const failed = connected<AssignmentAck>(ctx);
    if (failed) return failed;

    // Idempotent by matchId: a retried push returns the original id rather
    // than creating a second assignment in the customer's dispatch board.
    const existing = store.assignments.get(assignment.matchId);
    if (existing) {
      return tmsOk({ externalAssignmentId: `MOCK-ASN-${assignment.matchId}` });
    }
    store.assignments.set(assignment.matchId, assignment);
    return tmsOk({
      externalAssignmentId: `MOCK-ASN-${assignment.matchId}`,
      url: `https://mock-tms.test/assignments/${assignment.matchId}`,
    });
  },

  async pushStatus(ctx, update) {
    const failed = connected<void>(ctx);
    if (failed) return failed;
    store.statuses.push(update);
    return tmsOk(undefined);
  },

  async parseWebhook(rawBody, headers, secret) {
    const signature = headers['x-mock-signature'] ?? '';
    const timestamp = headers['x-mock-timestamp'];

    const verified = verifyHmacSignature({ rawBody, signature, secret, timestamp });
    if (!verified.valid) {
      return tmsErr<TmsEvent>('auth', `Signature rejected: ${verified.reason}`, {
        retryable: false,
      });
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return tmsErr<TmsEvent>('invalid_response', 'Body is not valid JSON', {
        retryable: false,
      });
    }

    const eventId = typeof body.id === 'string' ? body.id : '';
    if (!eventId) {
      // No idempotency key means we cannot safely dedupe. Reject loudly
      // rather than process a delivery we might already have handled.
      return tmsErr<TmsEvent>('invalid_response', 'Event is missing "id"', {
        retryable: false,
      });
    }

    const rawType = typeof body.type === 'string' ? body.type : '';
    const type: TmsEventType = MOCK_EVENT_TYPES.includes(rawType)
      ? (rawType as TmsEventType)
      : 'unknown';

    return tmsOk({
      eventId,
      type,
      occurredAt:
        typeof body.occurredAt === 'string' ? body.occurredAt : new Date().toISOString(),
      externalId: typeof body.externalId === 'string' ? body.externalId : undefined,
      payload: (body.data as Record<string, unknown>) ?? {},
    });
  },
};
