/**
 * Signed Stripe webhook payloads for the E2E suite.
 *
 * NO STRIPE ACCOUNT IS INVOLVED. Stripe's `constructEvent` verifies the
 * `stripe-signature` header with a local HMAC-SHA256 over `${timestamp}.${body}`
 * keyed by the webhook secret — no network call, no API key check. So the
 * whole signature-verification path and everything behind it can be driven
 * offline, provided the test process and the app server agree on
 * STRIPE_WEBHOOK_SECRET (set in playwright.config.ts and e2e.yml).
 *
 * The events built here are the match-fee shapes only, which is deliberate:
 * the subscription branch of the webhook calls
 * `stripe.subscriptions.retrieve()` and WOULD hit the network, so it stays
 * out of this suite until there is a Stripe test-mode key in CI.
 */
import crypto from 'node:crypto';

/** Must match STRIPE_WEBHOOK_SECRET in playwright.config.ts / e2e.yml. */
export const E2E_WEBHOOK_SECRET = 'whsec_e2e_test_secret';

/**
 * Build the `stripe-signature` header Stripe would send for this body.
 * Scheme: `t=<unix ts>,v1=<hex hmac of "<ts>.<body>">`.
 */
export function signWebhookPayload(
  body: string,
  opts: { secret?: string; timestamp?: number } = {}
): string {
  const secret = opts.secret ?? E2E_WEBHOOK_SECRET;
  const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

export interface MatchFeeEventOptions {
  tlaId: string;
  matchId: string;
  loadOwnerId: string;
  paymentIntentId: string;
  sessionId?: string;
  amountTotal?: number;
  eventId?: string;
}

/**
 * A `checkout.session.completed` event carrying match-fee metadata — the
 * shape src/app/api/stripe/webhooks/route.ts keys the $25 match-fee
 * lifecycle off (`metadata.type === 'match_fee'`).
 */
export function matchFeeCompletedEvent(opts: MatchFeeEventOptions): string {
  return JSON.stringify({
    id: opts.eventId ?? `evt_${Math.random().toString(36).slice(2, 12)}`,
    object: 'event',
    api_version: '2024-12-18.acacia',
    created: Math.floor(Date.now() / 1000),
    type: 'checkout.session.completed',
    data: {
      object: {
        id: opts.sessionId ?? `cs_test_${Math.random().toString(36).slice(2, 12)}`,
        object: 'checkout.session',
        mode: 'payment',
        payment_status: 'paid',
        status: 'complete',
        amount_total: opts.amountTotal ?? 2500,
        currency: 'usd',
        customer: 'cus_e2e_test',
        payment_intent: opts.paymentIntentId,
        metadata: {
          type: 'match_fee',
          tlaId: opts.tlaId,
          matchId: opts.matchId,
          loadOwnerId: opts.loadOwnerId,
        },
      },
    },
  });
}

/**
 * A `checkout.session.completed` event with NO match-fee metadata — the
 * webhook must accept and ignore it rather than erroring.
 */
export function unrelatedCompletedEvent(): string {
  return JSON.stringify({
    id: `evt_${Math.random().toString(36).slice(2, 12)}`,
    object: 'event',
    type: 'checkout.session.completed',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: 'cs_test_unrelated',
        object: 'checkout.session',
        mode: 'payment',
        amount_total: 1000,
        currency: 'usd',
        payment_intent: 'pi_unrelated',
        metadata: {},
      },
    },
  });
}
