import { test, expect, type Page } from '@playwright/test';
import { seedOwner, uniqueSeedEmail, closeSeedApp, FIXTURE_DOT } from './seed';
import { attachPageDiagnostics } from './helpers';

/**
 * T14 — the password-reset form does not reveal who has an account.
 *
 * `sendPasswordReset` (src/lib/actions.ts) returns the SAME message on every
 * path — link emailed, Resend unconfigured, or the account simply not
 * existing, which lands in the catch. That is deliberate: if the form said
 * "no account found with that email", anyone could walk a list of addresses
 * through it and learn which of your carriers are customers. Account
 * enumeration.
 *
 * Nothing was protecting that. A well-meaning "improve the error messages"
 * change would reintroduce it silently, which is exactly the kind of
 * regression a test should hold.
 *
 * The assertion is therefore a COMPARISON, not a fixed string: whatever the
 * page says, it must say the same thing for a real account and a made-up one.
 * Asserting the exact copy would fail the day someone rewords it, while
 * missing the day someone splits it in two.
 */

/**
 * The Alert the page renders — not the toast library's live region.
 *
 * This cost me the first run, and it is the mistake worth learning from.
 * `getByRole('alert')` looks obviously right and is wrong here: the toaster
 * mounts an empty, class-less `div[role="alert"]` on every page as an ARIA
 * live region, it comes first in the DOM, and a bare getByRole resolves to
 * it. The test failed with "expected length > 0, received 0" — an empty
 * string from an element that was never the one I meant.
 *
 * Diagnosed by dumping every [role="alert"] before and after submitting
 * rather than by guessing:
 *
 *   on load:      [{ role: alert, class: "",        text: "" }]
 *   after submit: [{ role: alert, class: "relative w-full rounded-lg border p-4 …",
 *                    text: "If an account exists for this email, …" },
 *                  { role: alert, class: "",        text: "" }]
 *
 * `.filter({ hasText: /\S/ })` says "the alert that actually says something",
 * which is what we mean and survives the toaster moving around. Using
 * `.first()` or `.last()` instead would depend on DOM order and break the
 * day a second alert renders.
 */
function realAlert(page: Page) {
  return page.getByRole('alert').filter({ hasText: /\S/ });
}

/** Submit the form and return the text of whatever response appears. */
async function requestReset(page: Page, email: string): Promise<string> {
  await page.goto('/forgot-password');

  // getByLabel matches the <Label htmlFor="email"> to its input. Preferred
  // over a CSS selector because it breaks if the form stops being reachable
  // by a screen reader, which is a bug worth failing on.
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: /send reset link/i }).click();

  // The server action round-trips, then the page swaps the form for an Alert.
  // Waiting on the element rather than a fixed timeout: Playwright retries
  // until it appears or the timeout expires, so this is both faster and more
  // reliable than page.waitForTimeout.
  const alert = realAlert(page);
  await expect(alert).toBeVisible({ timeout: 20_000 });
  return ((await alert.textContent()) ?? '').trim();
}

test.describe('T14 — password reset', () => {
  test.describe.configure({ timeout: 120_000 });
  test.afterAll(() => closeSeedApp());

  test('says the same thing whether or not the account exists', async ({ page }) => {
    attachPageDiagnostics(page);

    // A real account, and an address that certainly has none.
    const owner = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    const strangerEmail = uniqueSeedEmail('no-such-account');

    const forRealAccount = await requestReset(page, owner.email);
    const forStranger = await requestReset(page, strangerEmail);

    // Not vacuous: the page actually said something.
    expect(forRealAccount.length).toBeGreaterThan(0);

    // The property under test.
    expect(
      forStranger,
      'the reset form gave different answers for a registered and an unregistered ' +
        'email, which lets anyone test whether an address has an account'
    ).toBe(forRealAccount);

    // And it does not leak the answer by naming the address back.
    expect(forRealAccount).not.toContain(owner.email);
  });

  test('asks for an email instead of submitting an empty form', async ({ page }) => {
    attachPageDiagnostics(page);
    await page.goto('/forgot-password');

    // The input is `required`, so the browser blocks submission itself — no
    // request is made and no alert appears. Asserting the form is STILL there
    // is the honest check; asserting an error message would be testing a
    // message the app never shows.
    await page.getByRole('button', { name: /send reset link/i }).click();
    await expect(page.getByLabel('Email')).toBeVisible();
    // Filtered, for the reason in realAlert: an unfiltered count is always at
    // least 1 because of the toaster's live region, so this assertion would
    // fail on a page that is behaving perfectly.
    await expect(realAlert(page)).toHaveCount(0);
  });
});
