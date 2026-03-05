/**
 * DEBUG ONLY — remove before production
 * GET /api/fmcsa-debug?dot=3576923
 * Returns the raw QCMobile response so we can see the exact field names.
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

  const url = `https://mobile.fmcsa.dot.gov/qc/services/carriers/${dot}?webKey=${webKey}`;
  const res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
  const json = await res.json();

  // Return the full raw response — content, all keys, all values
  const content = json?.content;
  const carrier = content?.carrier ?? content;

  return NextResponse.json({
    status: res.status,
    rawContent: content,
    carrierKeys: carrier ? Object.keys(carrier) : [],
    carrier,
  });
}

export const GET = withCors(handleGet);
