import { test, expect } from '@playwright/test';
import { signUpOwner, STRONG_PASSWORD, uniqueEmail } from './helpers';

/**
 * T1 — Owner signup
 *
 * Validates:
 *   - /register accepts a new email/password/company
 *   - Account creation succeeds (no red error banner)
 *   - Post-signup hard-navigation to /create-profile works
 *   - Navigating to /dashboard does not bounce to /login — i.e. the
 *     fb-id-token session cookie and the Firebase Auth client are in sync
 *     (the regression that PR #165's consolidated POST /api/register fixed)
 */

test.describe('T1 — Owner signup', () => {
  test('a brand-new owner can sign up and reach /create-profile + /dashboard without being bounced', async ({ page }) => {
    await signUpOwner(page);

    await expect(page).toHaveURL(/\/create-profile/);
    await expect(page.getByRole('heading', { name: /create your company profile/i })).toBeVisible();

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
    await page.getByRole('button', { name: /sign in|log in|continue/i }).click();

    // Behaviour-based assertions (we don't hard-code the exact error string):
    //  - we must NOT end up authenticated on the dashboard
    //  - the global error boundary must NOT have caught anything
    await page.waitForTimeout(4_000);
    await expect(page).not.toHaveURL(/\/dashboard/);
    await expect(page.getByText(/oops, something went wrong/i)).toHaveCount(0);
  });
});
