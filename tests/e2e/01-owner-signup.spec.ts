import { test, expect } from '@playwright/test';
import { attachPageDiagnostics, signUpOwner, STRONG_PASSWORD, uniqueEmail } from './helpers';

/**
 * T1 — Owner signup + auth
 *
 * Validates:
 *   - /register accepts a new email/password/company
 *   - Account creation succeeds (no red error banner)
 *   - Post-signup hard-navigation to /create-profile works
 *   - Navigating to /dashboard does not bounce to /login — i.e. the
 *     fb-id-token session cookie and the Firebase Auth client are in sync
 *     (the regression that PR #165's consolidated POST /api/register fixed)
 *   - The login form rejects an unknown account without crashing
 *   - An existing owner can sign out and log back in (login success path)
 *   - An unauthenticated visitor is redirected away from /dashboard
 */

test.describe('T1 — Owner signup', () => {
  test.beforeEach(({ page }) => attachPageDiagnostics(page));

  test('a brand-new owner can sign up and reach /create-profile + /dashboard without being bounced', async ({ page }) => {
    await signUpOwner(page);

    await expect(page).toHaveURL(/\/create-profile/);
    // The "Create Your Company Profile" text is a shadcn <CardTitle>, which
    // renders as a <div> rather than an <h*> — so getByText, not getByRole.
    await expect(page.getByText(/create your company profile/i)).toBeVisible();

    // Critical regression check: no generic signup error toast / banner.
    await expect(page.getByText(/an error occurred during sign up/i)).toHaveCount(0);

    // Navigating to /dashboard must not bounce to /login.
    await page.goto('/dashboard');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('the login form rejects an unknown account without crashing the error boundary', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(uniqueEmail('nobody'));
    await page.getByLabel(/password/i).fill(STRONG_PASSWORD);
    // The /login submit button's idle text is literally "Login" (one word).
    await page.getByRole('button', { name: /^log ?in$|^sign ?in$/i }).click();

    // Behaviour-based assertions (we don't hard-code the exact error string):
    //  - we must NOT end up authenticated on the dashboard
    //  - the global error boundary must NOT have caught anything
    await page.waitForTimeout(4_000);
    await expect(page).not.toHaveURL(/\/dashboard/);
    await expect(page.getByText(/oops, something went wrong/i)).toHaveCount(0);
  });

  test('an owner who signs out can log back in and reach an authenticated page', async ({ page }) => {
    // signUpOwner leaves the account created AND signed in on /create-profile.
    const { email } = await signUpOwner(page);

    // Sign out via the /register "Already Signed In" card.
    await page.goto('/register');
    await page.getByRole('button', { name: /sign out/i }).click();
    // Signed out → /register falls back to the signup form.
    await expect(page.getByRole('button', { name: /create company account/i })).toBeVisible({ timeout: 15_000 });

    // Log back in with the same credentials the account was created with.
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(STRONG_PASSWORD);
    await page.getByRole('button', { name: /^log ?in$|^sign ?in$/i }).click();

    // A successful owner login hard-navigates into the authenticated area
    // (/dashboard, or /create-profile if the profile is still incomplete).
    // It must NOT stay on or bounce back to /login.
    await page.waitForURL(/\/(dashboard|create-profile)/, { timeout: 30_000 });
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('an unauthenticated visitor is redirected from /dashboard to /login', async ({ page }) => {
    // Fresh browser context — no fb-id-token cookie. The dashboard middleware
    // must bounce an unauthenticated request to /login.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});
