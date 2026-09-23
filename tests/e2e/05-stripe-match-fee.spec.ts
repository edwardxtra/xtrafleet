import { test, expect } from '@playwright/test';
import {
  seedOwner,
  seedTla,
  readTla,
  readPayment,
  countAuditLogs,
  closeSeedApp,
  FIXTURE_DOT,
} from './seed';
import {
  signWebhookPayload,
  matchFeeCompletedEvent,
  unrelatedCompletedEvent,
} from './stripe-events';

/**
 * T5 — Stripe match-fee webhook
 *
 * The $25 match fee is the platform's revenue event, and until now nothing
 * tested it: CI blanked STRIPE_SECRET_KEY, so `src/lib/stripe.ts` threw at
 * import and every Stripe route was unreachable.
 *
 * No Stripe account is needed to fix that for THIS path. Signature
 * verification is a local HMAC, and the match-fee branch of the handler
 * makes no Stripe API calls — it only reads the event and writes Firestore.
 * So the suite supplies an obviously-fake key (see playwright.config.ts) and
 * drives the real endpoint with really-signed payloads.
 *
 * What is deliberately NOT covered: the subscription branch calls
 * `stripe.subscriptions.retrieve()` and would hit the network. That needs a
 * Stripe test-mode key in CI, and is left out rather than faked.
 *
 * These call the route directly instead of going through Stripe Checkout in a
 * browser — the assertion is about what the handler writes, and no UI is
 * involved in a webhook.
 */

const WEBHOOK_URL = '/api/stripe/webhooks';

test.describe('T5 — Stripe match-fee webhook', () => {
  test.afterAll(() => closeSeedApp());

  test('rejects a request with no stripe-signature header', async ({ request }) => {
    const res = await request.post(WEBHOOK_URL, {
      headers: { 'content-type': 'application/json' },
      data: '{}',
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/no signature/i);
  });

  test('rejects a payload signed with the wrong secret', async ({ request }) => {
    // The whole point of the signature: anyone who can reach this URL must not
    // be able to mark a match fee paid.
    const body = matchFeeCompletedEvent({
      tlaId: 'tla-forged',
      matchId: 'match-forged',
      loadOwnerId: 'owner-forged',
      paymentIntentId: 'pi_forged',
    });
    const res = await request.post(WEBHOOK_URL, {
      headers: {
        'content-type': 'application/json',
        'stripe-signature': signWebhookPayload(body, { secret: 'whsec_not_the_real_secret' }),
      },
      data: body,
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/invalid signature/i);
  });

  test('rejects a valid signature over a tampered body', async ({ request }) => {
    const original = matchFeeCompletedEvent({
      tlaId: 'tla-tamper',
      matchId: 'match-tamper',
      loadOwnerId: 'owner-tamper',
      paymentIntentId: 'pi_tamper',
      amountTotal: 2500,
    });
    const signature = signWebhookPayload(original);
    const tampered = original.replace('"amount_total":2500', '"amount_total":1');

    const res = await request.post(WEBHOOK_URL, {
      headers: { 'content-type': 'application/json', 'stripe-signature': signature },
      data: tampered,
    });
    expect(res.status()).toBe(400);
  });

  test('a signed match-fee event records the payment, flips the TLA and audits it', async ({ request }) => {
    const lessee = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    const lessor = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    const tla = await seedTla({
      matchId: 'match-paid-1',
      lessorOwnerId: lessor.uid,
      lesseeOwnerId: lessee.uid,
    });

    const paymentIntentId = `pi_e2e_${Date.now()}`;
    const body = matchFeeCompletedEvent({
      tlaId: tla.id,
      matchId: 'match-paid-1',
      loadOwnerId: lessee.uid,
      paymentIntentId,
    });

    const res = await request.post(WEBHOOK_URL, {
      headers: { 'content-type': 'application/json', 'stripe-signature': signWebhookPayload(body) },
      data: body,
    });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ received: true });

    // (1) The payments doc is the source of truth for refunds and /admin/billing.
    const payment = await readPayment(paymentIntentId);
    expect(payment).toBeDefined();
    expect(payment?.type).toBe('match_fee');
    expect(payment?.status).toBe('succeeded');
    expect(payment?.amount).toBe(2500);
    expect(payment?.currency).toBe('usd');
    expect(payment?.tlaId).toBe(tla.id);
    expect(payment?.ownerOperatorId).toBe(lessee.uid);

    // (2) The TLA is marked paid and points back at the PaymentIntent.
    const updated = await readTla(tla.id);
    expect(updated?.matchFeePaid).toBe(true);
    expect(updated?.matchFeePaymentId).toBe(paymentIntentId);
    expect(updated?.matchFeePaidAt).toBeTruthy();

    // (3) Exactly one audit entry for the money movement.
    expect(await countAuditLogs('match_fee_paid', tla.id)).toBe(1);
  });

  test('a redelivered event does not double-record the payment or move paidAt', async ({ request }) => {
    // Stripe retries on any non-2xx and can redeliver after a success. Both
    // the payments write (keyed by PaymentIntent id) and the TLA flip are
    // supposed to be idempotent; this is the test that says so.
    const lessee = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    const lessor = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    const tla = await seedTla({
      matchId: 'match-retry-1',
      lessorOwnerId: lessor.uid,
      lesseeOwnerId: lessee.uid,
    });

    const paymentIntentId = `pi_e2e_retry_${Date.now()}`;
    const send = async () => {
      const body = matchFeeCompletedEvent({
        tlaId: tla.id,
        matchId: 'match-retry-1',
        loadOwnerId: lessee.uid,
        paymentIntentId,
      });
      return request.post(WEBHOOK_URL, {
        headers: { 'content-type': 'application/json', 'stripe-signature': signWebhookPayload(body) },
        data: body,
      });
    };

    expect((await send()).status()).toBe(200);
    const afterFirst = await readTla(tla.id);
    const firstPaidAt = afterFirst?.matchFeePaidAt;
    const firstPayment = await readPayment(paymentIntentId);

    // Redeliver the same event.
    expect((await send()).status()).toBe(200);

    const afterSecond = await readTla(tla.id);
    expect(afterSecond?.matchFeePaid).toBe(true);
    expect(afterSecond?.matchFeePaidAt).toBe(firstPaidAt);

    const secondPayment = await readPayment(paymentIntentId);
    expect(secondPayment?.paidAt).toBe(firstPayment?.paidAt);
    expect(secondPayment?.createdAt).toBe(firstPayment?.createdAt);

    // Still exactly one audit entry — the money moved once.
    expect(await countAuditLogs('match_fee_paid', tla.id)).toBe(1);
  });

  test('a TLA already marked paid is left untouched by a later event', async ({ request }) => {
    const lessee = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    const lessor = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    const tla = await seedTla({
      matchId: 'match-prepaid',
      lessorOwnerId: lessor.uid,
      lesseeOwnerId: lessee.uid,
      matchFeePaid: true,
      overrides: { matchFeePaymentId: 'pi_original', matchFeePaidAt: '2026-01-01T00:00:00.000Z' },
    });

    const body = matchFeeCompletedEvent({
      tlaId: tla.id,
      matchId: 'match-prepaid',
      loadOwnerId: lessee.uid,
      paymentIntentId: `pi_late_${Date.now()}`,
    });
    const res = await request.post(WEBHOOK_URL, {
      headers: { 'content-type': 'application/json', 'stripe-signature': signWebhookPayload(body) },
      data: body,
    });
    expect(res.status()).toBe(200);

    const after = await readTla(tla.id);
    expect(after?.matchFeePaymentId).toBe('pi_original');
    expect(after?.matchFeePaidAt).toBe('2026-01-01T00:00:00.000Z');
    expect(await countAuditLogs('match_fee_paid', tla.id)).toBe(0);
  });

  test('accepts and ignores a completed session that is not a match fee', async ({ request }) => {
    const body = unrelatedCompletedEvent();
    const res = await request.post(WEBHOOK_URL, {
      headers: { 'content-type': 'application/json', 'stripe-signature': signWebhookPayload(body) },
      data: body,
    });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(await readPayment('pi_unrelated')).toBeUndefined();
  });
});
