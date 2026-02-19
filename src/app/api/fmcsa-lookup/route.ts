import { NextRequest, NextResponse } from 'next/server';
import { lookupByDOT, lookupByMC } from '@/lib/fmcsa';
import { withCors } from '@/lib/api-cors';
import { verifyAuthToken } from '@/lib/api-auth';

/**
 * GET /api/fmcsa-lookup?dot=1234567
 * GET /api/fmcsa-lookup?mc=987654
 *
 * Requires a valid Firebase auth token (Bearer).
 * Returns normalized FMCSA carrier data.
 */
async function handleGet(request: NextRequest) {
  // Require authenticated user — don't expose the FMCSA web key to the public
  const authResult = await verifyAuthToken(request);
  if (!authResult.success) {
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
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({ carrier: result.carrier });
}

export const GET = withCors(handleGet);
