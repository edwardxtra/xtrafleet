import { test, expect } from '@playwright/test';
import { seedOwner, seedDriver, logInAs, closeSeedApp, FIXTURE_DOT } from './seed';
import { attachPageDiagnostics } from './helpers';
import { WITHHELD_DRIVER_FIELDS } from '../../src/lib/marketplace/projection';

/**
 * T9 — /api/marketplace/drivers
 *
 * The server-side replacement for the browser's unfiltered driver
 * subscription. Three properties worth pinning, in order of what breaks worst:
 *
 *   1. It refuses an anonymous caller, and a caller without the marketplace
 *      attestations.
 *   2. It never returns a sensitive field. The unit tests assert that against
 *      the projection function; this asserts it against the real HTTP
 *      response, built from a real Firestore document, which is the thing a
 *      carrier would actually receive.
 *   3. It returns drivers at all — otherwise 1 and 2 pass trivially.
 */

test.describe('T9 — marketplace driver discovery', () => {
  test.describe.configure({ timeout: 120_000 });
  test.afterAll(() => closeSeedApp());

  test('an anonymous caller is refused', async ({ request }) => {
    const res = await request.get('/api/marketplace/drivers');
    expect([401, 403]).toContain(res.status());
  });

  test('a caller without the marketplace attestations is refused', async ({ page }) => {
    attachPageDiagnostics(page);
    // seedOwner's default attestations ARE the marketplace pair, so strip them.
    const bare = await seedOwner({ dotNumber: FIXTURE_DOT.clean, attestations: [] });
    await logInAs(page, bare.email, bare.password);

    const res = await page.request.get('/api/marketplace/drivers');
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.missingAttestations).toContain('profileInsurance');
  });

  test('returns drivers, and not one sensitive field among them', async ({ page }) => {
    attachPageDiagnostics(page);
    const other = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    await seedDriver(other.uid, { name: 'Marketplace Driver', location: 'Plant City, FL' });

    const caller = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    await logInAs(page, caller.email, caller.password);

    const res = await page.request.get('/api/marketplace/drivers?limit=200');
    expect(res.status()).toBe(200);
    const body = await res.json();

    // Not vacuous: there is something in the response.
    expect(Array.isArray(body.drivers)).toBe(true);
    expect(body.drivers.length).toBeGreaterThan(0);

    // The matcher's inputs survived.
    const sample = body.drivers[0];
    expect(sample).toHaveProperty('location');
    expect(sample).toHaveProperty('availability');
    expect(sample).toHaveProperty('vehicleType');

    // Nothing sensitive did. Checked over the whole payload, not one record —
    // a leak in any single driver is the leak.
    const raw = JSON.stringify(body);
    const leaked = WITHHELD_DRIVER_FIELDS.filter((f) => raw.includes(`"${f}"`));
    expect(leaked, `sensitive fields in the response: ${leaked.join(', ')}`).toEqual([]);

    // seedDriver writes a CDL number and an MVR number by default; neither
    // should appear anywhere in the body.
    expect(raw).not.toContain('S1234567');
  });

  test('paginates rather than returning the whole marketplace', async ({ page }) => {
    attachPageDiagnostics(page);
    const owner = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    for (let i = 0; i < 4; i++) {
      await seedDriver(owner.uid, { name: `Page Driver ${i}`, location: 'Lakeland, FL' });
    }
    await logInAs(page, owner.email, owner.password);

    const first = await page.request.get('/api/marketplace/drivers?limit=2');
    expect(first.status()).toBe(200);
    const page1 = await first.json();
    expect(page1.drivers.length).toBeLessThanOrEqual(2);
    expect(page1.nextCursor).toBeTruthy();

    const second = await page.request.get(
      `/api/marketplace/drivers?limit=2&cursor=${encodeURIComponent(page1.nextCursor)}`
    );
    expect(second.status()).toBe(200);
    const page2 = await second.json();

    // Different rows, not the same page served twice.
    const ids1 = page1.drivers.map((d: { id: string }) => d.id);
    const ids2 = page2.drivers.map((d: { id: string }) => d.id);
    expect(ids2.some((id: string) => ids1.includes(id))).toBe(false);
  });
});
