import { test, expect } from '@playwright/test';
import { attachPageDiagnostics, signUpOwner, reachDashboard } from './helpers';

/**
 * T3 — Load posting gate + visibility
 *
 * The profileInsurance / profileAuthority attestations are now captured as
 * required checkboxes at signup (see signUpOwner + /api/register), so the
 * user is fully onboarded on finishing registration — the whole point of the
 * DEV-154 "onboard-at-signup" increment. That means a brand-new owner DOES
 * have both attestations on file.
 *
 * PR #155 added a load-post gate ("Complete Your Profile First" blocking
 * card at /dashboard/loads/new) and #170 added the same gate to the match
 * marketplace at /dashboard/matches, both keyed on those two attestations.
 * Because signup now satisfies them, a fresh owner must PASS both gates: the
 * load form renders, and the marketplace renders — the gate card must NOT
 * appear. These assert exactly that (the positive path the attestation-at-
 * signup change unlocks).
 *
 * The blocked path (owner missing the attestations) is no longer reachable
 * via a fresh signup — it needs an owner seeded without them, which requires
 * an emulator seed step (see the seed follow-up noted below).
 */

test.describe('T3 — Load posting', () => {
  test.beforeEach(({ page }) => attachPageDiagnostics(page));

  test('an onboarded-at-signup owner passes the attestation gate and reaches the load form', async ({ page }) => {
    await signUpOwner(page);
    await reachDashboard(page);

    await page.goto('/dashboard/loads/new');

    // Signup captured profileInsurance + profileAuthority, so the PR #155 gate
    // lets the form render: the "Complete Your Profile First" blocking card
    // must NOT appear and the Origin input MUST render.
    await expect(page.getByLabel(/^origin/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/complete your profile first/i)).toHaveCount(0);
  });

  test('an onboarded-at-signup owner passes the attestation gate and reaches the match marketplace', async ({ page }) => {
    await signUpOwner(page);
    await reachDashboard(page);

    await page.goto('/dashboard/matches');

    // Same #170 gate: with both attestations on file the marketplace renders.
    // The "My Assets" panel's description is a unique marker for that surface;
    // the "Complete Your Profile First" blocking card must NOT appear.
    await expect(page.getByText(/select your load or driver to find matches/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/complete your profile first/i)).toHaveCount(0);
  });

  // The happy path still needs to fill the full load form (Origin,
  // Destination, Load Type, Compensation, pickup date, CDL class) and read it
  // back on two surfaces — fragile enough to keep as a follow-up. Attestation
  // seeding is no longer a blocker (signup handles it); only the form-fill is.
  test.fixme('a posted load appears on /dashboard/loads AND in Find Match My Assets', async ({ page }) => {
    await signUpOwner(page);
    await reachDashboard(page);
    // TODO: fill /dashboard/loads/new (Origin, Destination, Load Type,
    //       Compensation, today's pickup date, CDL class), submit.
    // TODO: assert the load shows on /dashboard/loads.
    // TODO: assert the load shows on /dashboard/matches under My Assets.
  });
});
