import { test, expect } from '@playwright/test';
import { seedOwner, seedDriver, seedLoad, logInAs, closeSeedApp, FIXTURE_DOT } from './seed';
import { attachPageDiagnostics } from './helpers';

/**
 * T11 — what a carrier can see of ANOTHER carrier's driver.
 *
 * The score-breakdown Sheet on /dashboard/matches renders ComplianceScorecard
 * for drivers drawn from `driverPoolForLoad`, which is explicitly filtered to
 * `ownerId !== user.uid`. So every driver reachable from it belongs to someone
 * else, and the panel used to show, for each one:
 *
 *   - the CDL number, hyperlinked to the licence scan
 *   - the issuing state and licence class
 *   - the insurer and the policy number
 *   - the insurance expiry, hyperlinked to the COI
 *
 * Both links resolve a Firebase download token, so the URL IS the document
 * regardless of storage.rules.
 *
 * This is the test that measures what a carrier actually sees, rather than what
 * a function returns. The unit tests in src/lib/__tests__/scorecard-visibility
 * cover the status decisions; this covers the rendered panel.
 *
 * Full scope — a carrier viewing its OWN driver — is covered by those unit
 * tests rather than here. The obvious E2E for it would load
 * /dashboard/drivers/{id}, and that page does not render a seeded driver under
 * the emulators: it builds the right path for the right uid against a document
 * that exists and still reports "Driver not found". Unrelated to this change
 * (nothing here touches that page) and not worked around — flagged instead.
 */

const CDL_NUMBER = 'S1234567';          // seedDriver's default
const POLICY_NUMBER = 'POL-E2E-SECRET'; // seeded below, distinctive on purpose
const COI_URL = 'https://storage.invalid/coi-e2e.pdf';
const CDL_SCAN_URL = 'https://storage.invalid/cdl-scan-e2e.pdf';

// Unique per run. The suite seeds a lot of drivers — 09-marketplace-drivers
// uses the name "Marketplace Driver" too — so a shared name plus .first() made
// this test open somebody else's card and read their (absent) endorsements. It
// passed alone and failed in the suite, which is the worst way for a test to be
// wrong: it looked like a real finding.
const DRIVER_NAME = `Scope Probe ${Date.now()}`;
const DESTINATION = `Scope Probe Dest ${Date.now()}`;

test.describe('T11 — scorecard scope', () => {
  test.describe.configure({ timeout: 180_000 });
  test.afterAll(() => closeSeedApp());

  test("another carrier's driver shows status, not documents", async ({ page }) => {
    attachPageDiagnostics(page);

    // The other carrier's driver: fully compliant, every identifier on file.
    const otherCarrier = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    await seedDriver(otherCarrier.uid, {
      name: DRIVER_NAME,
      location: 'Lakeland, FL',
      compliance: 'green',
      overrides: {
        insurerName: 'Acme Mutual',
        insurancePolicyNumber: POLICY_NUMBER,
        insuranceUrl: COI_URL,
        cdlDocumentUrl: CDL_SCAN_URL,
        endorsements: 'H,N',
        profileStatus: 'complete',
        profileComplete: true,
      },
    });

    // The viewing carrier, with a load to match against.
    const caller = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    await seedLoad(caller.uid, { origin: 'Lakeland, FL', destination: DESTINATION });

    await logInAs(page, caller.email, caller.password);
    await page.goto('/dashboard/matches');

    // Pick the load, which populates the match results.
    await page.getByRole('button', { name: new RegExp(DESTINATION) }).click();

    // Open the breakdown on THIS driver's card, not whichever card happens to
    // be first — the suite seeds many drivers into the same marketplace.
    const card = page
      .locator('div.shadow-none.overflow-hidden')
      .filter({ hasText: DRIVER_NAME });
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.getByRole('button', { name: /View compliance & score breakdown/i }).click();

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    // Not vacuous, and confirms we opened the right driver's panel.
    await expect(sheet.getByText(new RegExp(DRIVER_NAME))).toBeVisible();
    await expect(sheet.getByText(/CDL Status/)).toBeVisible();

    const shown = (await sheet.textContent()) ?? '';

    // --- The disclosure is gone -------------------------------------------
    expect(shown, 'CDL number must not be rendered').not.toContain(CDL_NUMBER);
    expect(shown, 'policy number must not be rendered').not.toContain(POLICY_NUMBER);
    expect(shown, 'insurer name must not be rendered').not.toContain('Acme Mutual');

    // No link to either stored document, anywhere in the panel.
    const hrefs = await sheet.locator('a[href]').evaluateAll((els) =>
      els.map((e) => (e as HTMLAnchorElement).getAttribute('href') ?? '')
    );
    expect(hrefs.join(' '), 'no link to the CDL scan or the COI').not.toContain('storage.invalid');

    // --- And it reads as withheld, not as missing -------------------------
    // The distinction this whole change is about: the earlier version said
    // "Class not on file" and "No insurance information on file", which assert
    // something false about the driver.
    await expect(sheet.getByText(/Held by the employing carrier/).first()).toBeVisible();
    expect(shown).not.toContain('Class not on file');
    expect(shown).not.toContain('No insurance information on file');
    expect(shown).not.toContain('awaiting profile submission');

    // --- The compliant driver is not reported as non-compliant ------------
    // This was the headline bug: the banner derived Red from the absence of a
    // withheld field, for a driver whose documents were all valid.
    expect(shown, 'a compliant driver must not read as Red').not.toContain(
      'Overall Compliance: Red'
    );
    await expect(sheet.getByText('Overall Compliance: Green')).toBeVisible();

    // --- What a carrier still needs survives ------------------------------
    // Expiry dates are the signal; endorsements are a capability, not an ID.
    await expect(sheet.getByText(/Expiry/).first()).toBeVisible();
    await expect(sheet.getByText(/Hazardous Materials/)).toBeVisible();
  });

});
