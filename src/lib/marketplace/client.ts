/**
 * Browser-side readers for the projected marketplace endpoints.
 *
 * WHY A MODULE AND NOT AN INLINE fetch()
 *
 * Both endpoints page, and a partial read means different things depending on
 * which one is truncated:
 *
 *   - a short DRIVER list shows less capacity than exists. Visible, benign.
 *   - a short COMMITMENT list reads as "no conflict", so a driver already on a
 *     load comes back bookable. Silent, and wrong in the dangerous direction —
 *     which is why /api/commitments drains server-side and reports `complete`
 *     rather than handing out a cursor at all.
 *
 * So completeness is part of the return value here, never inferred from a
 * non-empty array. The page surfaces it; it does not get to ignore it.
 *
 * Auth rides the `fb-id-token` cookie, which authenticateRequest reads. A plain
 * same-origin fetch carries it, so there is no bearer token to plumb through.
 */
import type { MarketplaceDriver, MarketplaceLoad } from './projection';
import type { DriverCommitment } from '@/lib/commitments';

/** Rows per request while draining. The endpoints cap this at 500. */
const PAGE_SIZE = 250;

/**
 * Most requests one drain will make.
 *
 * At 250 a page that is 5,000 drivers. Past it the result comes back
 * `complete: false` rather than quietly truncated: a marketplace that large
 * needs a geographic filter, not a longer loop, and this cap is where that
 * need announces itself instead of being hidden by a slow page.
 */
const MAX_PAGES = 20;

export interface MarketplaceDriversResult {
  drivers: MarketplaceDriver[];
  /** False when the drain hit MAX_PAGES — the list is known incomplete. */
  complete: boolean;
}

export interface CommitmentsResult {
  commitments: DriverCommitment[];
  /**
   * False when the server could not read every live commitment. A caller MUST
   * treat conflict checking as unavailable, not as "no conflicts found".
   */
  complete: boolean;
}

interface FetchOptions {
  pageSize?: number;
  maxPages?: number;
  /** Injectable for tests. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

/** Throws on a non-2xx, carrying the server's message when it sent one. */
async function getJson(
  url: string,
  fetchImpl: typeof fetch
): Promise<Record<string, unknown>> {
  const res = await fetchImpl(url, { credentials: 'same-origin' });
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { error?: string };
      detail = body?.error ? `: ${body.error}` : '';
    } catch {
      /* non-JSON error body — the status is enough */
    }
    throw new Error(`${url} responded ${res.status}${detail}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

/**
 * Every marketplace driver the caller may see, projected.
 *
 * Pages by the cursor the endpoint returns, which is taken from the last
 * document READ rather than the last returned — so a page whose rows were all
 * filtered out advances instead of stalling.
 */
export async function fetchMarketplaceDrivers(
  opts: FetchOptions = {}
): Promise<MarketplaceDriversResult> {
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const maxPages = opts.maxPages ?? MAX_PAGES;
  const fetchImpl = opts.fetchImpl ?? fetch;

  const drivers: MarketplaceDriver[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    const url =
      `/api/marketplace/drivers?limit=${pageSize}` +
      (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
    const body = await getJson(url, fetchImpl);
    const batch = Array.isArray(body.drivers) ? (body.drivers as MarketplaceDriver[]) : [];
    drivers.push(...batch);

    const next = typeof body.nextCursor === 'string' ? body.nextCursor : null;
    if (!next) return { drivers, complete: true };
    cursor = next;
  }

  // Ran out of pages with a cursor still outstanding.
  return { drivers, complete: false };
}

/**
 * Live driver commitments, as windows.
 *
 * One request: the endpoint drains server-side, precisely because a truncated
 * commitment list is readable as "free". Its `complete` flag is passed straight
 * through — this function never substitutes a default for it, because the safe
 * default and the useful one point opposite ways.
 */
export async function fetchCommitments(
  opts: Pick<FetchOptions, 'fetchImpl'> = {}
): Promise<CommitmentsResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const body = await getJson('/api/commitments', fetchImpl);
  return {
    commitments: Array.isArray(body.commitments)
      ? (body.commitments as DriverCommitment[])
      : [],
    // Absent means unknown, and unknown is not a yes.
    complete: body.complete === true,
  };
}

export interface MarketplaceLoadsResult {
  loads: MarketplaceLoad[];
  /** False when the drain hit MAX_PAGES — the list is known incomplete. */
  complete: boolean;
}

/**
 * Every load on the marketplace board, projected.
 *
 * Replaces the browser's unfiltered collectionGroup('loads') subscription,
 * which streamed every load document in the platform into every tab and
 * filtered by status locally.
 *
 * A short list here fails in the same benign direction as a short driver
 * list: the board shows less work than exists, which is visible to the
 * carrier rather than silently wrong. Contrast fetchCommitments, where a
 * short list reads as "no conflict".
 */
export async function fetchMarketplaceLoads(
  opts: FetchOptions = {}
): Promise<MarketplaceLoadsResult> {
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const maxPages = opts.maxPages ?? MAX_PAGES;
  const fetchImpl = opts.fetchImpl ?? fetch;

  const loads: MarketplaceLoad[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    const url =
      `/api/marketplace/loads?limit=${pageSize}` +
      (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
    const body = await getJson(url, fetchImpl);
    const batch = Array.isArray(body.loads) ? (body.loads as MarketplaceLoad[]) : [];
    loads.push(...batch);

    const next = typeof body.nextCursor === 'string' ? body.nextCursor : null;
    if (!next) return { loads, complete: true };
    cursor = next;
  }

  return { loads, complete: false };
}
