import { test, expect } from '@playwright/test';
import { seedOwner, logInAs, closeSeedApp, FIXTURE_DOT } from './seed';
import { attachPageDiagnostics } from './helpers';

/**
 * T7 — /api/agent auth and guard (DEV-151 + DEV-174)
 *
 * Only the paths that return BEFORE a model is touched are covered here:
 * authentication, input validation and the size cap. CI has no model key, so
 * anything reaching the model would fail for an uninteresting reason — and
 * those are exactly the paths worth pinning anyway, because they are what
 * stands between an LLM endpoint and the open internet.
 *
 * The agent's own answers are not asserted. Testing what a model says is a
 * different exercise (see scripts/eval-doc-extraction.ts for the shape that
 * takes).
 */

const AGENT_URL = '/api/agent';

test.describe('T7 — agent endpoint guard', () => {
  test.beforeEach(({ page }) => attachPageDiagnostics(page));
  test.afterAll(() => closeSeedApp());

  test('refuses an anonymous caller', async ({ request }) => {
    const res = await request.post(AGENT_URL, {
      headers: { 'content-type': 'application/json' },
      data: { question: 'How many drivers do I have?' },
    });
    expect(res.status()).toBe(401);
  });

  test('authenticates BEFORE sizing the input', async ({ request }) => {
    // Ordering matters: the uid is the data boundary, so it must be
    // established first. An anonymous oversized request is a 401, not a 413 —
    // we should not be telling strangers anything about our limits.
    const res = await request.post(AGENT_URL, {
      headers: { 'content-type': 'application/json' },
      data: { question: 'x'.repeat(5000) },
    });
    expect(res.status()).toBe(401);
  });

  test('rejects an empty question', async ({ page }) => {
    const owner = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    await logInAs(page, owner.email, owner.password);

    for (const body of [{}, { question: '' }, { question: '   ' }]) {
      const res = await page.request.post(AGENT_URL, {
        headers: { 'content-type': 'application/json' },
        data: body,
      });
      expect(res.status()).toBe(400);
    }
  });

  test('rejects a question past the input cap', async ({ page }) => {
    const owner = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    await logInAs(page, owner.email, owner.password);

    const res = await page.request.post(AGENT_URL, {
      headers: { 'content-type': 'application/json' },
      data: { question: 'x'.repeat(2_001) },
    });
    expect(res.status()).toBe(413);
    expect((await res.json()).error).toContain('too long');
  });

  test('accepts a question just inside the cap', async ({ page }) => {
    // Proves the cap is a boundary, not a blanket rejection. This one DOES
    // reach the model, which has no key in CI — so the only assertion is
    // that it got past the guard (anything but 400/401/413).
    const owner = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    await logInAs(page, owner.email, owner.password);

    const res = await page.request.post(AGENT_URL, {
      headers: { 'content-type': 'application/json' },
      data: { question: 'x'.repeat(2_000) },
    });
    expect([400, 401, 413]).not.toContain(res.status());
  });
});
