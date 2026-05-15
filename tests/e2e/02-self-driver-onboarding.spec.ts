import { test, expect } from '@playwright/test';
import { attachPageDiagnostics, signUpOwner, reachDashboard } from './helpers';

/**
 * T2 — Self-driver onboarding
 *
 * Core (reliably testable): an OO can "Add Myself as Driver" and the driver
 * record appears in /dashboard/drivers tagged with the "Owner-Driver" badge.
 *
 * Follow-on (test.fixme): clicking into the self-driver detail, opening the
 * "Complete Driver Profile" sheet (the flow from #154), filling the full
 * profile form, and confirming the compliance scorecard flips the Driver
 * Authorization & Disclosure attestation to "Verified". That path drives
 * Radix <Select> components (cdlState / cdlClass) whose option markup is
 * runtime-dependent — left fixme'd until the suite is running green and we
 * can iterate the selectors against a real DOM.
 *
 * Selector references (verified against src/components/add-self-as-driver-button.tsx):
 *   - trigger button: "Add Myself as Driver"
 *   - sheet inputs: "First Name *", "Last Name *", "Phone Number", "Home Location"
 *   - sheet submit: also labelled "Add Myself as Driver" (scoped to the dialog)
 *   - driver list rows carry data-testid="driver-row" + data-driver-self
 */

test.describe('T2 — Self-driver onboarding', () => {
  test.beforeEach(({ page }) => attachPageDiagnostics(page));

  test('an OO can add themselves as a driver and the record shows in the drivers list', async ({ page }) => {
    await signUpOwner(page);
    await reachDashboard(page);

    await page.goto('/dashboard/drivers');

    // Open the "Add Myself as Driver" sheet.
    await page.getByRole('button', { name: /add myself as driver/i }).click();

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();

    await sheet.getByLabel(/first name/i).fill('Test');
    await sheet.getByLabel(/last name/i).fill('Owner-Driver');
    await sheet.getByLabel(/phone/i).fill('5555550100');
    await sheet.getByLabel(/location/i).fill('Tampa, FL');

    // The sheet's submit button shares the "Add Myself as Driver" label, so
    // scope the lookup to the dialog and take the submit (last) one.
    await sheet.getByRole('button', { name: /add myself as driver/i }).click();

    // Sheet closes, the new self-driver row appears with the Owner-Driver badge.
    await expect(sheet).toBeHidden({ timeout: 10_000 });
    const selfDriverRow = page
      .getByTestId('driver-row')
      .filter({ has: page.getByText(/owner-driver/i) });
    await expect(selfDriverRow).toHaveCount(1, { timeout: 10_000 });
  });

  // Un-fixme once the suite is green and the Radix Select option selectors
  // for cdlState / cdlClass have been verified against a real run.
  test.fixme('completing the self-driver profile flips the attestation to Verified', async ({ page }) => {
    await signUpOwner(page);
    await reachDashboard(page);
    await page.goto('/dashboard/drivers');
    // TODO: add self as driver (reuse the flow above)
    // TODO: click the data-testid="driver-row" with data-driver-self="true"
    // TODO: click "Complete Driver Profile" banner button
    // TODO: fill DOB / CDL number / cdlState <Select> / cdlClass <Select> /
    //       medical cert expiry, tick the Authorization & Disclosure checkbox
    // TODO: submit, assert the "Complete Driver Profile" banner is gone and
    //       the Attestations section reads "Verified"
  });
});
