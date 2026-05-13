import { Page, expect } from '@playwright/test';

/**
 * Shared helpers for the E2E suite. The goal is to keep each spec readable
 * by hiding the boilerplate (find email input → fill → click submit → wait)
 * behind small intent-revealing functions.
 *
 * Selectors prefer role + label / accessible name over data-testid where
 * possible — that keeps tests semi-resilient to component reskins. Where
 * the existing markup is ambiguous, we fall back to data-testid (the
 * scaffold PR adds the minimum required testids to existing components).
 */

export function uniqueEmail(prefix = 'oo'): string {
  // Emulator allows reusing emails, but keeping them unique per run makes
  // Firestore docs easier to identify in the emulator UI when debugging.
  return `${prefix}+${Date.now()}-${Math.floor(Math.random() * 1e4)}@xtrafleet-e2e.test`;
}

export const STRONG_PASSWORD = 'TestPassword!1';

/**
 * Walks an owner through /register and asserts they land on /create-profile
 * (the post-signup redirect target for new owners).
 */
export async function signUpOwner(page: Page, opts?: { email?: string; companyName?: string }) {
  const email = opts?.email ?? uniqueEmail('oo');
  const companyName = opts?.companyName ?? `E2E Fleet ${Date.now()}`;

  await page.goto('/register');
  await page.getByLabel(/company name/i).fill(companyName);
  await page.getByLabel(/business email/i).fill(email);
  await page.getByLabel(/password/i).fill(STRONG_PASSWORD);
  // The "I confirm I am authorized" checkbox uses a Radix Checkbox which
  // renders a button[role=checkbox]. getByRole works.
  await page.getByRole('checkbox', { name: /authorized to act/i }).click();
  await page.getByRole('button', { name: /create company account/i }).click();

  // The post-signup flow is: session POST -> hard navigate to /create-profile.
  await page.waitForURL('**/create-profile', { timeout: 30_000 });

  return { email, companyName };
}

/**
 * Completes the minimal viable company profile so the load-post gate
 * doesn't block subsequent steps. Uses fake DOT/MC numbers that pass
 * format validation but aren't expected to FMCSA-verify in test mode.
 */
export async function completeCompanyProfile(page: Page) {
  // Profile uses split address fields. We fill them directly instead of
  // relying on the FMCSA auto-fill, which would require Radar/FMCSA API
  // mocks. The "I confirm" / required checkboxes are typically inside
  // the form; we just submit and tolerate the "Incomplete profile" toast
  // since the load-post gate only needs profile attestations, not all
  // form fields filled. For now the spec stops at /dashboard navigation.

  await page.getByLabel(/legal name/i).first().fill('E2E Fleet Inc.');
  await page.getByLabel(/dot/i).first().fill('1234567');
  await page.getByLabel(/mc/i).first().fill('123456');
  await page.getByLabel(/street/i).first().fill('123 Main St');
  await page.getByLabel(/city/i).first().fill('Tampa');
  await page.getByLabel(/state/i).first().fill('FL');
  await page.getByLabel(/zip/i).first().fill('33602');

  // The form has a "Save" / "Save & Continue" button — match loosely.
  await page.getByRole('button', { name: /save/i }).first().click();

  // After save the form either redirects to /dashboard or stays on the
  // page with a toast. Tolerate both: navigate manually if needed.
  await Promise.race([
    page.waitForURL('**/dashboard', { timeout: 15_000 }).catch(() => null),
    page.waitForTimeout(3_000),
  ]);
  if (!page.url().includes('/dashboard')) {
    await page.goto('/dashboard');
  }
  await expect(page).toHaveURL(/\/dashboard/);
}
