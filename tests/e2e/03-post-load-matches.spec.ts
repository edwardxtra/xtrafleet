import { test, expect } from '@playwright/test';
import { attachPageDiagnostics, signUpOwner, reachDashboard } from './helpers';

/**
 * T3 — Load posting gate + visibility
 *
 * A brand-new owner has NO profileInsurance / profileAuthority attestations
 * on file (those are only captured via the recapture sheet from #155, never
 * at signup). PR #155 added a load-post gate that renders a "Complete Your
 * Profile First" blocking card at /dashboard/loads/new when those
 * attestations are missing.
 *
 * So for a fresh account the reliably-testable behaviour is: the gate
 * blocks them — at /dashboard/loads/new AND at /dashboard/matches (the
 * match marketplace gate added in #170). That's a real, valuable
 * regression check on the DEV-154 Layer-2 soft-compliance gate.
 *
 * The full "post a load → see it on /dashboard/loads → see it in Find
 * Match My Assets" happy path needs the profile attestations seeded first
 * (so the gate lets the form render). That requires an emulator seed step
 * — left as a follow-up (see test.fixme below) once the suite is running
 * green and we add a seed helper.
 */

test.describe('T3 — Load posting', () => {
  test.beforeEach(({ page }) => attachPageDiagnostics(page));

  test('a profile-incomplete owner is blocked from posting a load by the attestation gate', async ({ page }) => {
    await signUpOwner(page);
    await reachDashboard(page);

    await page.goto('/dashboard/loads/new');

    // PR #155 gate: "Complete Your Profile First" blocking card. The load
    // form (Origin / Destination inputs) must NOT render.
    await expect(page.getByText(/complete your profile first/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: /go to profile/i })).toBeVisible();
    await expect(page.getByLabel(/^origin/i)).toHaveCount(0);
  });

  test('a profile-incomplete owner is blocked from the match marketplace by the attestation gate', async ({ page }) => {
    await signUpOwner(page);
    await reachDashboard(page);

    await page.goto('/dashboard/matches');

    // #170 gate: the marketplace shows the same "Complete Your Profile First"
    // blocking card as the load-post gate. The marketplace panels — and
    // therefore the match-request buttons — must NOT render. The "My Assets"
    // panel's description is a unique marker for that surface.
    await expect(page.getByText(/complete your profile first/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: /go to profile/i })).toBeVisible();
    await expect(page.getByText(/select your load or driver to find matches/i)).toHaveCount(0);
  });

  // Needs an emulator seed step that writes profileInsurance +
  // profileAuthority attestations onto the owner doc so the gate lets the
  // form render. Add a tests/e2e/seed.ts helper, then un-fixme this.
  test.fixme('a posted load appears on /dashboard/loads AND in Find Match My Assets', async ({ page }) => {
    await signUpOwner(page);
    await reachDashboard(page);
    // TODO: seed profileInsurance + profileAuthority attestations.
    // TODO: fill /dashboard/loads/new (Origin, Destination, Load Type,
    //       Compensation, today's pickup date, CDL class), submit.
    // TODO: assert the load shows on /dashboard/loads.
    // TODO: assert the load shows on /dashboard/matches under My Assets.
  });
});
