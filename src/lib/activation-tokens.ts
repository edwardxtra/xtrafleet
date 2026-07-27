/**
 * Activation tokens for white-glove pre-activation onboarding (DEV-158).
 *
 * A pre-activated account is claimed via a one-time activation link. The raw
 * token only ever travels in the activation email / URL; Firestore stores only
 * its SHA-256 hash (as the activation_tokens doc id), so a leaked database read
 * cannot be turned into a working link.
 */
import { randomBytes, createHash } from 'crypto';

/** How long an activation link stays valid. */
export const ACTIVATION_TOKEN_TTL_DAYS = 14;

/** Generate an opaque, URL-safe one-time activation token. */
export function generateActivationToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Hash a raw token into the value stored as the activation_tokens doc id. */
export function hashActivationToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
