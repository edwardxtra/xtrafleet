import { NextRequest, NextResponse } from 'next/server';
import { lookupByDOT, lookupByMC } from '@/lib/fmcsa';
import { withCors } from '@/lib/api-cors';
import { authenticateRequest } from '@/lib/api-auth';

/**
 * GET /api/fmcsa-lookup?dot=1234567
 * GET /api/fmcsa-lookup?mc=987654
 *
 * Requires a valid Firebase auth token (Bearer or session cookie).
 * Returns normalized FMCSA carrier data.
 *
 * 200 — verified motor carrier
 * 400 — missing query params
 * 401 — unauthenticated
 * 403 — valid DOT/MC but entity is a freight broker (not a motor carrier)
 * 404 — DOT/MC not found in FMCSA records
 */
async function handleGet(request: NextRequest) {
  try {
    await authenticateRequest(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dot = searchParams.get('dot')?.trim();
  const mc = searchParams.get('mc')?.trim();

  if (!dot && !mc) {
    return NextResponse.json(
      { error: 'Provide either ?dot= or ?mc= query parameter' },
      { status: 400 }
    );
  }

  const result = dot ? await lookupByDOT(dot) : await lookupByMC(mc!);

  if (!result.success) {
    // Broker-only entities get a 403 with a clear user-facing message
    if (result.isBroker) {
      return NextResponse.json({ error: result.error, isBroker: true }, { status: 403 });
    }
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({ carrier: result.carrier });
}

export const GET = withCors(handleGet);
