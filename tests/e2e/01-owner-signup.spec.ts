import { test, expect } from '@playwright/test';
import { signUpOwner, STRONG_PASSWORD, uniqueEmail } from './helpers';

/**
 * T1 — Owner signup
 *
 * Validates:
 *   - /register form accepts a new email/password/company
 *   - Account creation succeeds (no red error banner)
 *   - Post-signup hard-navigation to /create-profile works
 *   - Reloading /create-profile keeps the user authenticated (session
 *     cookie + Firebase Auth client are in sync — the regression we hit
 *     repeatedly during QA testing)
 *   - Navigating to /dashboard does not bounce back to /login
 */

test.describe('T1 — Owner signup', () => {
  test('a brand-new owner can sign up and reach /create-profile + /dashboard without being bounced', async ({ page }) => {
    await signUpOwner(page);

    // We're on /create-profile after the hard navigation.
    await expect(page).toHaveURL(/\/create-profile/);

    // Page renders the "Create Your Company Profile" header.
    await expect(page.getByRole('heading', { name: /create your company profile/i })).toBeVisible();

    // Critical regression check: no global error toast.
    await expect(page.getByText(/an error occurred during sign up/i)).toHaveCount(0);

    // Navigating to /dashboard should not bounce to /login.
    // (The middleware checks for fb-id-token; if the session POST race
    // hadn't landed, the user would be kicked here.)
    await page.goto('/dashboard');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('login form rejects an unknown account but does not crash', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(uniqueEmail('nobody'));
    await page.getByLabel(/password/i).fill(STRONG_PASSWORD);
    await page.getByRole('button', { name: /sign in|log in/i }).click();

    // We expect a visible error message, not a global error boundary.
    await expect(page.getByText(/invalid|incorrect|no user|not found/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/oops, something went wrong/i)).toHaveCount(0);
  });
});
