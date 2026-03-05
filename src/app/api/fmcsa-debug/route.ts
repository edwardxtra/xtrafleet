/**
 * DEBUG ONLY — remove before production
 * GET /api/fmcsa-debug?dot=3576923
 * Fetches carrier + docket-numbers + basics endpoints and returns all raw responses.
 */
import { NextRequest, NextResponse } from 'next/server';
import { withCors } from '@/lib/api-cors';
import { authenticateRequest } from '@/lib/api-auth';

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

  const [carrierRes, docketRes, basicsRes] = await Promise.all([
    fetch(`${base}?webKey=${webKey}`, { cache: 'no-store', headers: { Accept: 'application/json' } }),
    fetch(`${base}/docket-numbers?webKey=${webKey}`, { cache: 'no-store', headers: { Accept: 'application/json' } }),
    fetch(`${base}/basics?webKey=${webKey}`, { cache: 'no-store', headers: { Accept: 'application/json' } }),
  ]);

  const [carrierJson, docketJson, basicsJson] = await Promise.all([
    carrierRes.json().catch(() => null),
    docketRes.json().catch(() => null),
    basicsRes.json().catch(() => null),
  ]);

  const carrier = carrierJson?.content?.carrier ?? carrierJson?.content ?? null;

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
    basics: {
      status: basicsRes.status,
      data: basicsJson,
    },
  });
}

export const GET = withCors(handleGet);
