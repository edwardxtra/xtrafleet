import { Page, expect } from '@playwright/test';

/**
 * Shared helpers for the E2E suite. Keep each spec readable by hiding the
 * boilerplate (find input → fill → click → wait) behind intent-revealing
 * functions.
 *
 * Selector strategy: prefer role + accessible label (getByLabel, getByRole)
 * over data-testid where the markup already has good accessible names. A few
 * data-testid attributes are added to the app only where the markup is
 * genuinely ambiguous (e.g., a driver table row that needs to be clicked).
 */

/**
 * Stream browser diagnostics into the test's stdout. Without this, failures
 * only surface in the HTML report artifact — annoying to retrieve from CI.
 * With it, the plain job log shows browser console errors, uncaught page
 * errors, failed requests, and any 4xx/5xx API responses (with the response
 * body) — usually enough to diagnose a flaky test without downloading the
 * report. Call once per Page (e.g. from a test.beforeEach).
 */
export function attachPageDiagnostics(page: Page) {
  page.on('console', msg => {
    const t = msg.type();
    if (t === 'error' || t === 'warning') {
      console.log(`[browser:${t}] ${msg.text()}`);
    }
  });
  page.on('pageerror', err => {
    console.log(`[browser:pageerror] ${err.message}`);
  });
  page.on('requestfailed', req => {
    console.log(
      `[browser:requestfailed] ${req.method()} ${req.url()} — ${req.failure()?.errorText}`,
    );
  });
  page.on('response', async resp => {
    if (resp.status() < 400) return;
    const url = resp.url();
    // Skip Next.js dev noise (HMR / chunk fetches).
    if (url.includes('/_next/') || url.includes('hot-update')) return;
    console.log(`[browser:response] ${resp.status()} ${resp.request().method()} ${url}`);
    if (url.includes('/api/')) {
      try {
        const body = await resp.text();
        if (body) console.log(`[browser:body] ${body.slice(0, 500)}`);
      } catch {
        // ignore — body may already be consumed
      }
    }
  });
}

export function uniqueEmail(prefix = 'oo'): string {
  return `${prefix}+${Date.now()}-${Math.floor(Math.random() * 1e4)}@xtrafleet-e2e.test`;
}

export const STRONG_PASSWORD = 'TestPassword!1';

/**
 * Walks an owner through /register and asserts they land on /create-profile
 * (the post-signup redirect target for new owners). Verified against
 * src/app/register/page.tsx markup:
 *   - "Company Name *"  label  → companyName input
 *   - "Business Email *" label → email input
 *   - "Password *" label       → password input
 *   - signupAuthorized checkbox (Radix; accessible name = the attestation text)
 *   - "Create Company Account" submit button
 */
export async function signUpOwner(page: Page, opts?: { email?: string; companyName?: string }) {
  const email = opts?.email ?? uniqueEmail('oo');
  const companyName = opts?.companyName ?? `E2E Fleet ${Date.now()}`;

  await page.goto('/register');
  await page.getByLabel(/company name/i).fill(companyName);
  await page.getByLabel(/business email/i).fill(email);
  await page.getByLabel(/password/i).fill(STRONG_PASSWORD);
  await page.getByRole('checkbox', { name: /authorized to act/i }).click();
  await page.getByRole('button', { name: /create company account/i }).click();

  // Post-signup flow: POST /api/register → signInWithEmailAndPassword →
  // POST /api/auth/session → hard navigate to /create-profile.
  await page.waitForURL('**/create-profile', { timeout: 30_000 });

  return { email, companyName };
}

/**
 * Confirms the freshly-signed-up owner has an authenticated session that
 * survives navigation into the dashboard area.
 *
 * Deliberately does NOT fill the company profile form. That form is the
 * single most fragile thing to drive from a test — FMCSA verification, COI
 * upload, an operating-states multiselect, and a server action that may or
 * may not redirect. The dashboard middleware only gates on the presence of
 * the fb-id-token cookie, so a profile-incomplete owner can still reach the
 * dashboard area; that's all T2 / T3 actually need for their setup.
 */
export async function reachDashboard(page: Page) {
  await page.goto('/dashboard');
  // Must NOT be bounced to /login — the regression we kept hitting where the
  // session cookie and the Firebase Auth client desynced. /create-profile is
  // also an acceptable landing spot (still authenticated).
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
}
