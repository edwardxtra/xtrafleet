import { test, expect } from '@playwright/test';
import { seedOwner, seedDriver, seedLoad, logInAs, closeSeedApp, FIXTURE_DOT } from './seed';
import { attachPageDiagnostics } from './helpers';
import { WITHHELD_DRIVER_FIELDS } from '../../src/lib/marketplace/projection';

/**
 * T12 — /dashboard/matches no longer streams driver documents to the browser.
 *
 * T11 proved the UI stops RENDERING another carrier's CDL and insurance
 * details. This proves the browser stops RECEIVING them: the page now reads
 * outside capacity from /api/marketplace/drivers instead of an unfiltered
 * collectionGroup('drivers') listener.
 *
 * The difference matters. After T11 the fields were still in the payload — a
 * network tab, a React devtools inspection or a stray console.log would show
 * them. This closes that, so the two tests together cover both the path a
 * person walks and the one a payload exposes.
 *
 * HOW THIS IS MEASURED
 *
 * Not by reading response bodies. Firestore streams over a long-lived
 * WebChannel, and `response.text()` on it succeeds only sometimes — in a probe
 * run, 11 bodies readable and 9 not. A test built on that passed happily with
 * the old unfiltered listener restored, which is to say it measured nothing.
 *
 * What IS reliable is the Listen channel's REQUEST payloads. A subscription
 * registers an `addTarget`, and its `structuredQuery.from[]` names the
 * collection and whether the query descends into subcollections. A
 * collectionGroup('drivers') listener appears there as
 * `{ collectionId: "drivers", allDescendants: true }`; the owner-scoped
 * own-fleet listener appears as the same collectionId with allDescendants
 * absent or false. So the assertion is on the targets the page registers,
 * which is both precise and observable.
 *
 * The /api/ responses ARE readable, so the projection payload is checked the
 * ordinary way.
 */

const DRIVER_NAME = `Switch Probe ${Date.now()}`;
const DESTINATION = `Switch Probe Dest ${Date.now()}`;
const CDL_NUMBER = 'S1234567';          // seedDriver's default
const POLICY_NUMBER = 'POL-SWITCH-SECRET';
const MVR_NUMBER = 'MVR-E2E-001';       // seedDriver's default

test.describe('T12 — the browser stops receiving driver documents', () => {
  test.describe.configure({ timeout: 180_000 });
  test.afterAll(() => closeSeedApp());

  test('no sensitive driver field crosses the wire, and matching still works', async ({ page }) => {
    attachPageDiagnostics(page);

    const otherCarrier = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    await seedDriver(otherCarrier.uid, {
      name: DRIVER_NAME,
      location: 'Lakeland, FL',
      compliance: 'green',
      overrides: {
        insurerName: 'Acme Mutual',
        insurancePolicyNumber: POLICY_NUMBER,
        insuranceUrl: 'https://storage.invalid/coi-switch.pdf',
        cdlDocumentUrl: 'https://storage.invalid/cdl-switch.pdf',
        endorsements: 'H,N',
      },
    });

    const caller = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    await seedLoad(caller.uid, { origin: 'Lakeland, FL', destination: DESTINATION });

    // Every Firestore target the page subscribes to, decoded from the Listen
    // channel's request payloads.
    const targets: Array<{ collectionId?: string; allDescendants?: boolean }> = [];
    page.on('request', (req) => {
      // NOT '/Firestore/Listen/channel' — the path is
      // `google.firestore.v1.Firestore/Listen/channel`, so Firestore is
      // preceded by a dot and that filter silently matches nothing. It cost me
      // a run where the whole assertion passed on zero captured targets.
      if (!req.url().includes('/Listen/channel')) return;
      const body = req.postData();
      if (!body) return;
      // The payload is form-encoded with the request JSON under req0___data__.
      for (const pair of body.split('&')) {
        const [key, value] = pair.split('=');
        if (!key.includes('___data__') || !value) continue;
        try {
          const parsed = JSON.parse(decodeURIComponent(value));
          const from = parsed?.addTarget?.query?.structuredQuery?.from;
          if (Array.isArray(from)) targets.push(...from);
        } catch {
          /* not every frame is a target registration */
        }
      }
    });

    // The API responses, which unlike the channel are reliably readable.
    const apiBodies: string[] = [];
    page.on('response', async (res) => {
      if (!res.url().includes('/api/')) return;
      try {
        apiBodies.push(await res.text());
      } catch {
        /* skip */
      }
    });

    await logInAs(page, caller.email, caller.password);
    await page.goto('/dashboard/matches');
    await page.getByRole('button', { name: new RegExp(DESTINATION) }).click();

    // Wait for the driver to actually be matched — otherwise every assertion
    // below passes vacuously on a page that loaded nothing.
    const card = page
      .locator('div.shadow-none.overflow-hidden')
      .filter({ hasText: DRIVER_NAME });
    await expect(card).toBeVisible({ timeout: 60_000 });

    // Give the listen channel a moment to deliver anything else it would.
    await page.waitForTimeout(3_000);

    const wire = apiBodies.join('\n');
    // Not vacuous: we captured API traffic, and it carried this driver, so we
    // are looking at the response that delivered them rather than having missed
    // it entirely.
    expect(wire.length).toBeGreaterThan(0);
    expect(wire).toContain(DRIVER_NAME);

    // --- No collection-group driver listener exists any more ---------------
    const groupDriverTargets = targets.filter(
      (t) => t.collectionId === 'drivers' && t.allDescendants === true
    );
    expect(
      groupDriverTargets,
      'the page subscribed to drivers across all carriers; that listener is what ' +
        'streamed the qualification file into every browser'
    ).toEqual([]);

    // Not vacuous either: the page does register targets, so an empty result
    // above means "no such target" rather than "we saw no targets at all".
    expect(targets.length).toBeGreaterThan(0);

    // --- The projected payload carries nothing sensitive -------------------
    const leakedKeys = WITHHELD_DRIVER_FIELDS.filter((f) => wire.includes(`"${f}"`));
    expect(
      leakedKeys,
      `withheld driver fields in the API response: ${leakedKeys.join(', ')}`
    ).toEqual([]);

    expect(wire, 'CDL number in the response').not.toContain(CDL_NUMBER);
    expect(wire, 'MVR number in the response').not.toContain(MVR_NUMBER);
    expect(wire, 'policy number in the response').not.toContain(POLICY_NUMBER);
    expect(wire, 'document URL in the response').not.toContain('storage.invalid');

    // --- Matching still works on the projection ---------------------------
    // The point of the projection is that the matcher never needed those
    // fields. If the switch broke scoring, this is where it shows.
    await expect(card.getByText(/\/100/)).toBeVisible();
    await expect(card.getByText(/Green/)).toBeVisible();
  });

  test('a carrier still sees its own drivers in full', async ({ page }) => {
    attachPageDiagnostics(page);
    // The own-fleet panel reads an owner-scoped subscription, not the
    // projection, because the scorecard on my own drivers needs the whole file.
    // If that regressed, a carrier would lose its own roster.
    const owner = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    await seedDriver(owner.uid, { name: 'My Own Switch Driver', compliance: 'green' });

    await logInAs(page, owner.email, owner.password);
    await page.goto('/dashboard/matches');

    await expect(page.getByText('My Own Switch Driver')).toBeVisible({ timeout: 30_000 });
    // And the count in the panel header is not zero.
    await expect(page.getByRole('heading', { name: /My Drivers \(\d+\)/ })).not.toHaveText(
      /My Drivers \(0\)/
    );
  });
});
