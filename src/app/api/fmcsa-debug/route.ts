/**
 * DEBUG ONLY — remove before production
 * GET /api/fmcsa-debug?dot=3576923
 * Fetches QCMobile (carrier + docket-numbers + mc-numbers + basics) and SAFER
 * and returns raw responses + what our extractor parsed. Used to diagnose
 * why phone / MC / inactive detection might be failing for a given DOT.
 */
import { NextRequest, NextResponse } from 'next/server';
import { withCors } from '@/lib/api-cors';
import { authenticateRequest } from '@/lib/api-auth';
import { fetchSAFERDebug, fetchLIDebug } from '@/lib/fmcsa';

async function handleGet(request: NextRequest) {
  try {
    await authenticateRequest(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dot = searchParams.get('dot')?.trim();
  if (!dot) return NextResponse.json({ error: 'Provide ?dot=' }, { status: 400 });

  const webKey = process.env.FMCSA_WEB_KEY;
  if (!webKey) return NextResponse.json({ error: 'FMCSA_WEB_KEY not set' }, { status: 500 });

  const base = `https://mobile.fmcsa.dot.gov/qc/services/carriers/${dot}`;

  const [carrierRes, docketRes, mcRes, basicsRes, safer] = await Promise.all([
    fetch(`${base}?webKey=${webKey}`, { cache: 'no-store', headers: { Accept: 'application/json' } }),
    fetch(`${base}/docket-numbers?webKey=${webKey}`, { cache: 'no-store', headers: { Accept: 'application/json' } }),
    fetch(`${base}/mc-numbers?webKey=${webKey}`, { cache: 'no-store', headers: { Accept: 'application/json' } }),
    fetch(`${base}/basics?webKey=${webKey}`, { cache: 'no-store', headers: { Accept: 'application/json' } }),
    fetchSAFERDebug(dot),
  ]);

  const [carrierJson, docketJson, mcJson, basicsJson] = await Promise.all([
    carrierRes.json().catch(() => null),
    docketRes.json().catch(() => null),
    mcRes.json().catch(() => null),
    basicsRes.json().catch(() => null),
  ]);

  const carrier = carrierJson?.content?.carrier ?? carrierJson?.content ?? null;

  // Pull the MC docket out of QCMobile (prefer MC, fall back to first entry)
  // so the L&I probe can try the docket-keyed deep links too.
  type DocketRow = { prefix?: string; docketNumber?: number };
  const mcRows: DocketRow[] = Array.isArray(mcJson?.content) ? mcJson.content : [];
  const mcRow = mcRows.find(d => String(d.prefix ?? '').toUpperCase() === 'MC') ?? mcRows[0];
  const mcNumber = mcRow?.docketNumber
    ? `${mcRow.prefix ?? 'MC'}-${mcRow.docketNumber}`
    : undefined;
  const li = await fetchLIDebug(dot, mcNumber);

  return NextResponse.json({
    carrier: {
      status: carrierRes.status,
      keys: carrier ? Object.keys(carrier) : [],
      data: carrier,
    },
    docketNumbers: {
      status: docketRes.status,
      data: docketJson,
    },
    mcNumbers: {
      status: mcRes.status,
      data: mcJson,
    },
    basics: {
      status: basicsRes.status,
      data: basicsJson,
    },
    safer,
    li,
  });
}

export const GET = withCors(handleGet);
