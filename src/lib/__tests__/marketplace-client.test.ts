import { describe, it, expect } from 'vitest';
import {
  fetchMarketplaceDrivers,
  fetchMarketplaceLoads,
  fetchCommitments,
} from '@/lib/marketplace/client';

/**
 * The drain, and what it says about its own completeness.
 *
 * The property worth pinning: a short list is never silently passed off as a
 * whole one. For drivers that costs visible capacity; for commitments it would
 * read as "no conflict" and let a committed driver be double-booked.
 */

/** A fake fetch serving canned pages, recording the URLs it was asked for. */
function fakeFetch(pages: Array<Record<string, unknown>>, calls: string[] = []) {
  let i = 0;
  const impl = (async (url: string | URL) => {
    calls.push(String(url));
    const body = pages[Math.min(i, pages.length - 1)];
    i++;
    return { ok: true, status: 200, json: async () => body } as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function erroringFetch(status: number, body?: unknown) {
  return (async () =>
    ({
      ok: false,
      status,
      json: async () => {
        if (body === undefined) throw new Error('not json');
        return body;
      },
    }) as Response) as unknown as typeof fetch;
}

describe('fetchMarketplaceDrivers', () => {
  it('follows the cursor to the end and reports complete', async () => {
    const { impl, calls } = fakeFetch([
      { drivers: [{ id: 'a' }, { id: 'b' }], nextCursor: 'cur-1' },
      { drivers: [{ id: 'c' }], nextCursor: null },
    ]);
    const res = await fetchMarketplaceDrivers({ pageSize: 2, fetchImpl: impl });
    expect(res.drivers.map((d) => d.id)).toEqual(['a', 'b', 'c']);
    expect(res.complete).toBe(true);
    expect(calls).toHaveLength(2);
    // The cursor really was sent, rather than the same page fetched twice.
    expect(calls[0]).not.toContain('cursor=');
    expect(calls[1]).toContain('cursor=cur-1');
  });

  it('url-encodes the cursor, which is a document path with slashes', async () => {
    const { impl, calls } = fakeFetch([
      { drivers: [], nextCursor: 'owner_operators/abc/drivers/xyz' },
      { drivers: [], nextCursor: null },
    ]);
    await fetchMarketplaceDrivers({ pageSize: 1, fetchImpl: impl });
    expect(calls[1]).toContain('cursor=owner_operators%2Fabc%2Fdrivers%2Fxyz');
  });

  it('keeps paging through a page whose rows were all filtered out', async () => {
    // The endpoint's cursor comes from the last document READ, so an empty page
    // with a cursor means "keep going", not "done".
    const { impl } = fakeFetch([
      { drivers: [], nextCursor: 'cur-1' },
      { drivers: [{ id: 'late' }], nextCursor: null },
    ]);
    const res = await fetchMarketplaceDrivers({ pageSize: 50, fetchImpl: impl });
    expect(res.drivers.map((d) => d.id)).toEqual(['late']);
    expect(res.complete).toBe(true);
  });

  it('reports incomplete rather than looping forever on an endless cursor', async () => {
    const { impl, calls } = fakeFetch([{ drivers: [{ id: 'x' }], nextCursor: 'always' }]);
    const res = await fetchMarketplaceDrivers({ pageSize: 1, maxPages: 3, fetchImpl: impl });
    expect(res.complete).toBe(false);
    expect(calls).toHaveLength(3);
    // The rows it did get are still returned — partial beats nothing, as long as
    // the caller is told it is partial.
    expect(res.drivers).toHaveLength(3);
  });

  it('throws on a refusal instead of returning an empty marketplace', async () => {
    // A 403 that came back as { drivers: [] } would render as "no capacity".
    await expect(
      fetchMarketplaceDrivers({ fetchImpl: erroringFetch(403, { error: 'attestations missing' }) })
    ).rejects.toThrow(/403.*attestations missing/);
  });

  it('still throws when the error body is not JSON', async () => {
    await expect(
      fetchMarketplaceDrivers({ fetchImpl: erroringFetch(500) })
    ).rejects.toThrow(/500/);
  });

  it('tolerates a malformed payload without inventing drivers', async () => {
    const { impl } = fakeFetch([{ drivers: 'not an array', nextCursor: null }]);
    const res = await fetchMarketplaceDrivers({ fetchImpl: impl });
    expect(res.drivers).toEqual([]);
  });
});

describe('fetchCommitments', () => {
  it('passes the window list and the server completeness through', async () => {
    const { impl } = fakeFetch([
      {
        commitments: [{ driverId: 'd1', kind: 'match', id: 'm1', window: { start: 1, end: 2 } }],
        complete: true,
      },
    ]);
    const res = await fetchCommitments({ fetchImpl: impl });
    expect(res.commitments).toHaveLength(1);
    expect(res.complete).toBe(true);
  });

  it('reads a missing complete flag as NOT complete', async () => {
    // Unknown is not a yes. Defaulting this to true would turn a server that
    // could not finish reading into a confident "no conflicts".
    const { impl } = fakeFetch([{ commitments: [] }]);
    expect((await fetchCommitments({ fetchImpl: impl })).complete).toBe(false);
  });

  it('reads a non-boolean complete flag as NOT complete', async () => {
    const { impl } = fakeFetch([{ commitments: [], complete: 'yes' }]);
    expect((await fetchCommitments({ fetchImpl: impl })).complete).toBe(false);
  });

  it('honours complete: false even with commitments present', async () => {
    const { impl } = fakeFetch([
      { commitments: [{ driverId: 'd1', kind: 'match', id: 'm1', window: { start: 1, end: 2 } }], complete: false },
    ]);
    const res = await fetchCommitments({ fetchImpl: impl });
    expect(res.commitments).toHaveLength(1);
    expect(res.complete).toBe(false);
  });

  it('throws rather than returning an empty, complete-looking result', async () => {
    await expect(
      fetchCommitments({ fetchImpl: erroringFetch(500, { error: 'boom' }) })
    ).rejects.toThrow(/500/);
  });

  it('makes exactly one request — the server drains, not the client', async () => {
    const { impl, calls } = fakeFetch([{ commitments: [], complete: true }]);
    await fetchCommitments({ fetchImpl: impl });
    expect(calls).toEqual(['/api/commitments']);
  });
});

describe('fetchMarketplaceLoads', () => {
  it('follows the cursor to the end and reports complete', async () => {
    const { impl, calls } = fakeFetch([
      { loads: [{ id: 'l1' }, { id: 'l2' }], nextCursor: 'cur-1' },
      { loads: [{ id: 'l3' }], nextCursor: null },
    ]);
    const res = await fetchMarketplaceLoads({ pageSize: 2, fetchImpl: impl });
    expect(res.loads.map((l) => l.id)).toEqual(['l1', 'l2', 'l3']);
    expect(res.complete).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain('/api/marketplace/loads');
    expect(calls[0]).not.toContain('cursor=');
    expect(calls[1]).toContain('cursor=cur-1');
  });

  it('url-encodes the cursor, which is a document path with slashes', async () => {
    const { impl, calls } = fakeFetch([
      { loads: [], nextCursor: 'owner_operators/abc/loads/xyz' },
      { loads: [], nextCursor: null },
    ]);
    await fetchMarketplaceLoads({ pageSize: 1, fetchImpl: impl });
    expect(calls[1]).toContain('cursor=owner_operators%2Fabc%2Floads%2Fxyz');
  });

  it('reports incomplete rather than looping forever on an endless cursor', async () => {
    // Every page hands back another cursor. The drain must stop and SAY it
    // stopped, not present a truncated board as the whole market.
    const { impl, calls } = fakeFetch([{ loads: [{ id: 'l' }], nextCursor: 'always' }]);
    const res = await fetchMarketplaceLoads({ pageSize: 1, maxPages: 3, fetchImpl: impl });
    expect(res.complete).toBe(false);
    expect(calls).toHaveLength(3);
  });

  it('throws on a refusal instead of returning an empty board', async () => {
    // A 403 from the attestation gate must not render as "no loads posted".
    await expect(
      fetchMarketplaceLoads({ fetchImpl: erroringFetch(403, { error: 'attestations expired' }) })
    ).rejects.toThrow(/403.*attestations expired/);
  });

  it('tolerates a malformed payload without inventing loads', async () => {
    const { impl } = fakeFetch([{ loads: 'not-an-array', nextCursor: null }]);
    const res = await fetchMarketplaceLoads({ fetchImpl: impl });
    expect(res.loads).toEqual([]);
    expect(res.complete).toBe(true);
  });
});
