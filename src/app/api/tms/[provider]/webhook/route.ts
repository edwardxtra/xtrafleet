import { NextRequest, NextResponse } from 'next/server';

/**
 * Inbound TMS webhook receiver (DEV-155).
 *
 * One route for every provider — the path segment selects the adapter, and
 * the adapter owns signature verification and payload normalization.
 *
 * The endpoint is **inert until a provider is configured**: with no
 * `TMS_WEBHOOK_SECRET_<PROVIDER>` set it returns 501 and never touches the
 * database. That means merging this ahead of any signed integration adds no
 * live attack surface, while giving us a URL to hand a provider during
 * scoping.
 *
 * It deliberately does no business logic. Verify → dedupe → store → 202.
 * Processing happens out of band, because a provider that times out
 * retries, and a retry that re-runs half-finished work is worse than a
 * delayed one.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Cap the body we're willing to hash. 1 MB is far above any real event. */
const MAX_BODY_BYTES = 1_000_000;

export async function POST(
  request: NextRequest,
  { params }: { params: { provider: string } }
) {
  const { isTmsProviderId } = await import('@/lib/tms/types');
  const providerParam = params.provider?.toLowerCase() ?? '';

  if (!isTmsProviderId(providerParam)) {
    return NextResponse.json({ error: 'Unknown provider' }, { status: 404 });
  }

  const { getWebhookSecret } = await import('@/lib/tms/signature');
  const secret = getWebhookSecret(providerParam);
  if (!secret) {
    // Not configured — indistinguishable from "not implemented" to a caller,
    // which is what we want: no signal about which integrations exist.
    return NextResponse.json(
      { error: 'Integration not enabled' },
      { status: 501 }
    );
  }

  const { resolveAdapter } = await import('@/lib/tms/registry');
  const resolved = resolveAdapter(providerParam, 'webhooks');
  if (!resolved.ok) {
    return NextResponse.json({ error: 'Integration not enabled' }, { status: 501 });
  }
  const adapter = resolved.data;
  if (!adapter.parseWebhook) {
    return NextResponse.json({ error: 'Integration not enabled' }, { status: 501 });
  }

  // Read the body as raw text — signatures are over exact bytes, so parsing
  // and re-serializing would invalidate every delivery.
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  const parsed = await adapter.parseWebhook(rawBody, headers, secret);
  if (!parsed.ok) {
    // 400, not 401: a provider retrying a request we will never accept is
    // wasted load on both sides.
    console.warn(
      `[tms/${providerParam}] rejected webhook: ${parsed.error.code} ${parsed.error.message}`
    );
    return NextResponse.json({ error: 'Invalid webhook' }, { status: 400 });
  }

  const event = parsed.data;

  try {
    const { recordTmsEvent } = await import('@/lib/tms/events');
    const { stored, id } = await recordTmsEvent(providerParam, event);

    if (!stored) {
      // Duplicate delivery. 200, so the provider stops retrying.
      console.log(`[tms/${providerParam}] duplicate event ${event.eventId}, ignored`);
      return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
    }

    console.log(`[tms/${providerParam}] stored event ${id} (${event.type})`);
    return NextResponse.json({ received: true, eventId: id }, { status: 202 });
  } catch (error) {
    // Storage failed — ask the provider to retry rather than silently
    // dropping an event we can never reconstruct.
    console.error(`[tms/${providerParam}] failed to store event:`, error);
    return NextResponse.json({ error: 'Temporarily unavailable' }, { status: 503 });
  }
}

/** Providers commonly probe the endpoint with GET during setup. */
export async function GET() {
  return NextResponse.json({ status: 'ok' }, { status: 200 });
}
