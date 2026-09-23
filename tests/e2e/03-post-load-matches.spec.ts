import { test, expect } from '@playwright/test';
import { seedOwner, logInAs, closeSeedApp, FIXTURE_DOT } from './seed';
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
  test.afterAll(() => closeSeedApp());

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

  test('a posted load appears on /dashboard/loads AND in Find Match My Assets', async ({ page }) => {
    // Seeding gives a profile-complete owner directly; the subject of this test
    // is posting a load through the UI, so the load itself is never seeded.
    const owner = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    await logInAs(page, owner.email, owner.password);

    const origin = 'Boston, MA';
    const destination = `Worcester, MA ${Date.now()}`;

    await page.goto('/dashboard/loads/new');
    await page.getByLabel(/^origin/i).fill(origin);
    await page.getByLabel(/^destination/i).fill(destination);

    // Radix Select: click the trigger, take the first option. Which load type
    // it is does not matter here — only that the form accepts a valid one.
    await page.getByRole('combobox').first().click();
    await page.getByRole('option').first().click();

    await page.getByLabel(/driver compensation/i).fill('1850');

    const pickup = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    await page.locator('#pickupDate').fill(pickup);

    // CDL Class Required is a checkbox group; ids are cdl-<class>.
    await page.locator('#cdl-A').check();
    // Separate required consent — validateForm() rejects without it.
    await page.locator('#verificationConsent').check();

    // The form is two-step: validate into a review screen, then publish.
    await page.getByRole('button', { name: /review load/i }).click();
    await page.getByRole('button', { name: /publish load/i }).click();

    // Surface 1: the loads list.
    await page.goto('/dashboard/loads');
    await expect(page.getByText(destination).first()).toBeVisible({ timeout: 20_000 });

    // Surface 2: the match marketplace's My Assets panel. A load that exists
    // but never reaches this panel is invisible to matching, which is the
    // regression worth catching.
    await page.goto('/dashboard/matches');
    await expect(page.getByText(destination).first()).toBeVisible({ timeout: 20_000 });
  });
});
