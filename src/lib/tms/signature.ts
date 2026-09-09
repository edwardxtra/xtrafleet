/**
 * Webhook signature verification (DEV-155).
 *
 * Every TMS signs webhooks differently, but nearly all of them are some
 * variant of "HMAC-SHA256 over the raw body, optionally with a timestamp
 * prefix to stop replays" — the same scheme Stripe uses, which
 * src/app/api/stripe/webhooks/route.ts already relies on. This module is
 * the shared primitive so each adapter only has to describe the *shape* of
 * its header, not re-implement the crypto (and not re-introduce a
 * non-constant-time comparison).
 *
 * Node-only: uses `crypto`. Routes importing it must set
 * `export const runtime = 'nodejs'`.
 */

import { createHmac, timingSafeEqual } from 'crypto';

export interface HmacVerifyOptions {
  /** Raw request body, exactly as received. Re-serializing breaks the digest. */
  rawBody: string;
  /** The signature the provider sent, hex-encoded. */
  signature: string;
  secret: string;
  /**
   * Unix seconds from the provider, when it sends one. Required to get
   * replay protection; without it a captured request is valid forever.
   */
  timestamp?: string | number;
  /** How stale a signed request may be. Default 5 minutes, like Stripe. */
  toleranceSeconds?: number;
  /** Clock source — injectable so tests don't have to sleep. */
  now?: () => number;
}

export type SignatureFailure =
  | 'missing_signature'
  | 'missing_secret'
  | 'malformed_signature'
  | 'signature_mismatch'
  | 'timestamp_out_of_tolerance';

export type SignatureResult =
  | { valid: true }
  | { valid: false; reason: SignatureFailure };

/**
 * The payload actually signed. With a timestamp we sign `${ts}.${body}` so
 * the timestamp can't be tampered with independently of the body.
 */
export function signedPayload(rawBody: string, timestamp?: string | number): string {
  return timestamp === undefined ? rawBody : `${timestamp}.${rawBody}`;
}

export function computeHmac(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

export function verifyHmacSignature(opts: HmacVerifyOptions): SignatureResult {
  const { rawBody, signature, secret, timestamp } = opts;

  if (!signature) return { valid: false, reason: 'missing_signature' };
  if (!secret) return { valid: false, reason: 'missing_secret' };

  // Strip a `sha256=` prefix if the provider uses one (GitHub-style).
  const hex = signature.includes('=') ? signature.split('=').pop()!.trim() : signature.trim();
  if (!/^[0-9a-f]+$/i.test(hex)) {
    return { valid: false, reason: 'malformed_signature' };
  }

  if (timestamp !== undefined) {
    const tolerance = opts.toleranceSeconds ?? 300;
    const now = (opts.now ?? Date.now)() / 1000;
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(now - ts) > tolerance) {
      return { valid: false, reason: 'timestamp_out_of_tolerance' };
    }
  }

  const expected = computeHmac(signedPayload(rawBody, timestamp), secret);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(hex, 'hex');

  // timingSafeEqual throws on length mismatch, which would itself leak length
  // through the exception path — check first and return the same reason.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: 'signature_mismatch' };
  }
  return { valid: true };
}

/**
 * Where a provider's webhook secret lives. One env var per provider so
 * rotating (or revoking) one integration never touches another.
 *
 * e.g. TMS_WEBHOOK_SECRET_MCLEOD
 */
export function webhookSecretEnvVar(provider: string): string {
  return `TMS_WEBHOOK_SECRET_${provider.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
}

export function getWebhookSecret(provider: string): string | undefined {
  return process.env[webhookSecretEnvVar(provider)] || undefined;
}
