import { test, expect } from '@playwright/test';
import { attachPageDiagnostics } from './helpers';
import { seedPendingMatch, closeSeedApp, FIXTURE_DOT } from './seed';

/**
 * The compliance gate — the invariant XtraFleet's claim rests on.
 *
 * DEV-157 names four claim-supporting behaviours. These tests cover the first
 * two at the only place they can be observed honestly, the real
 * /api/matches/accept endpoint with the real runComplianceGate():
 *
 *   1. the compliance check runs SYNCHRONOUSLY during match formation
 *   2. both parties are scored, not just one
 *
 * Nothing about the gate is mocked. The FMCSA transport underneath serves
 * recorded responses (src/lib/fmcsa-fixtures.ts) because CI has no
 * FMCSA_WEB_KEY — without that, every carrier resolves Unverified and only the
 * blocked path is reachable. The gate still calls, still decides.
 *
 * These drive the API rather than the matching UI on purpose: the assertion is
 * about server-side authority logic, and routing it through a multi-step
 * two-party negotiation screen would test the screen, not the gate.
 */
test.describe('compliance gate on match formation', () => {
  test.beforeEach(({ page }) => attachPageDiagnostics(page));
  test.afterAll(() => closeSeedApp());

  test('both carriers active and driver Green → the match forms', async ({ page }) => {
    const { match } = await seedPendingMatch(page, {
      loadOwnerDot: FIXTURE_DOT.clean,
      driverOwnerDot: FIXTURE_DOT.clean,
      compliance: 'green',
    });

    const res = await page.request.post('/api/matches/accept', {
      data: { matchId: match.id },
    });

    expect(res.status(), await res.text()).toBe(200);
  });

  test('driver-side carrier has inactive authority → blocked with 403', async ({ page }) => {
    // Layer 1: authority is the hard gate. 403 is the route's "inactive
    // authority" code, distinct from 422 "could not be verified".
    const { match } = await seedPendingMatch(page, {
      loadOwnerDot: FIXTURE_DOT.clean,
      driverOwnerDot: FIXTURE_DOT.revoked,
      compliance: 'green',
    });

    const res = await page.request.post('/api/matches/accept', {
      data: { matchId: match.id },
    });

    expect(res.status()).toBe(403);
    expect(await res.json()).toMatchObject({ complianceBlocked: true });
  });

  test('LOAD-side carrier has inactive authority → also blocked', async ({ page }) => {
    // The bilateral half of the invariant. A gate that only scored the driver's
    // carrier would let this through, and that is precisely the claim.
    const { match } = await seedPendingMatch(page, {
      loadOwnerDot: FIXTURE_DOT.revoked,
      driverOwnerDot: FIXTURE_DOT.clean,
      compliance: 'green',
    });

    const res = await page.request.post('/api/matches/accept', {
      data: { matchId: match.id },
    });

    expect(res.status()).toBe(403);
    expect(await res.json()).toMatchObject({ complianceBlocked: true });
  });

  test('carrier not in FMCSA records → blocked as unverifiable with 422', async ({ page }) => {
    // Unverifiable is not the same as failing: the route separates it (422)
    // from inactive authority (403), and the gate refuses both.
    const { match } = await seedPendingMatch(page, {
      loadOwnerDot: FIXTURE_DOT.clean,
      driverOwnerDot: FIXTURE_DOT.unknown,
      compliance: 'green',
    });

    const res = await page.request.post('/api/matches/accept', {
      data: { matchId: match.id },
    });

    expect(res.status()).toBe(422);
    expect(await res.json()).toMatchObject({ complianceBlocked: true });
  });

  test('an outsider cannot accept a match they are not party to', async ({ page }) => {
    const { match } = await seedPendingMatch(page, { loadOwnerDot: FIXTURE_DOT.clean });

    // Log in as a third owner with no relationship to the match.
    const { seedOwner, logInAs } = await import('./seed');
    const outsider = await seedOwner();
    await logInAs(page, outsider.email, outsider.password);

    const res = await page.request.post('/api/matches/accept', {
      data: { matchId: match.id },
    });

    expect(res.status()).toBe(403);
    expect(await res.text()).toMatch(/not a participant/i);
  });

  test('accepting without a matchId is rejected before any gate work', async ({ page }) => {
    await seedPendingMatch(page, { loadOwnerDot: FIXTURE_DOT.clean });

    const res = await page.request.post('/api/matches/accept', { data: {} });

    expect(res.status()).toBe(400);
    expect(await res.text()).toMatch(/matchId is required/i);
  });
});
