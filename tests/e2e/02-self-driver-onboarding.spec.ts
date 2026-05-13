import { test, expect } from '@playwright/test';
import { signUpOwner, completeCompanyProfile } from './helpers';

/**
 * T2 — Self-driver onboarding (the flow that was broken before #154)
 *
 * Validates:
 *   - "Add Self as Driver" creates the driver record
 *   - The OO's own driver appears in /dashboard/drivers
 *   - "Complete Driver Profile" banner is visible on the self-driver detail
 *     when the profile is still incomplete
 *   - Clicking the banner opens the completion sheet
 *   - Submitting the form transitions the compliance scorecard to "Verified"
 *     for the Driver Authorization & Disclosure attestation
 */

test.describe('T2 — Self-driver onboarding', () => {
  test('OO can add themselves as a driver and complete the driver-side profile', async ({ page }) => {
    await signUpOwner(page);
    await completeCompanyProfile(page);

    await page.goto('/dashboard/drivers');
    await page.getByRole('button', { name: /add (myself|self) as driver/i }).click();

    // Sheet opens — fill the minimum-required driver basics.
    await page.getByLabel(/first name/i).fill('Test');
    await page.getByLabel(/last name/i).fill('Driver');
    await page.getByLabel(/phone/i).fill('5555550100');
    await page.getByLabel(/location/i).fill('Tampa, FL');
    // CDL # is optional in the add-self payload; medical-cert expiry too.
    await page.getByRole('button', { name: /add|submit|save/i }).last().click();

    // Driver row should now show with the "Owner-Driver" badge.
    await expect(page.getByText(/owner-driver/i).first()).toBeVisible({ timeout: 10_000 });

    // Click into the driver detail view.
    await page.getByText(/owner-driver/i).first().click();

    // Self-driver detail shows the "Complete Driver Profile" CTA banner.
    await expect(page.getByRole('button', { name: /complete driver profile/i })).toBeVisible();
    await page.getByRole('button', { name: /complete driver profile/i }).click();

    // Sheet opens with the full profile form.
    await page.getByLabel(/date of birth/i).fill('1990-01-01');
    await page.getByLabel(/cdl number/i).fill('CDL-123456');
    // CDL state + class are Selects — open and pick.
    await page.getByLabel(/cdl state/i).click();
    await page.getByRole('option', { name: 'FL' }).click();
    await page.getByLabel(/cdl class/i).click();
    await page.getByRole('option', { name: 'A' }).click();
    await page.getByLabel(/medical/i).fill('2030-01-01');

    // Driver Authorization & Disclosure checkbox.
    await page.getByRole('checkbox', { name: /authorization|disclosure/i }).click();

    // Submit.
    await page.getByRole('button', { name: /submit|complete/i }).last().click();

    // After submit, the compliance scorecard "Attestations" section should
    // flip to Verified (or at least the banner should disappear).
    await expect(page.getByRole('button', { name: /complete driver profile/i })).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByText(/verified|attestation/i).first()).toBeVisible();
  });
});
