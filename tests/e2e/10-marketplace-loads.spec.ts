import { test, expect } from '@playwright/test';
import { seedOwner, seedLoad, seedMatch, logInAs, closeSeedApp, FIXTURE_DOT } from './seed';
import { attachPageDiagnostics } from './helpers';
import {
  WITHHELD_LOAD_FIELDS,
  WITHHELD_MATCH_FIELDS,
} from '../../src/lib/marketplace/projection';

/**
 * T10 — /api/marketplace/loads and /api/commitments
 *
 * The other two feeds /dashboard/matches currently streams straight into the
 * browser. The unit tests assert the projections against the functions; these
 * assert them against the real HTTP response built from real Firestore
 * documents, which is the thing a carrier would actually receive. A correct
 * projection wired up wrongly passes the first and fails the second.
 */

test.describe('T10 — marketplace board', () => {
  test.describe.configure({ timeout: 120_000 });
  test.afterAll(() => closeSeedApp());

  test('an anonymous caller is refused', async ({ request }) => {
    const loads = await request.get('/api/marketplace/loads');
    expect([401, 403]).toContain(loads.status());
    const commitments = await request.get('/api/commitments');
    expect([401, 403]).toContain(commitments.status());
  });

  test('a caller without the marketplace attestations is refused on both', async ({ page }) => {
    attachPageDiagnostics(page);
    // seedOwner's default attestations ARE the marketplace pair, so strip them.
    const bare = await seedOwner({ dotNumber: FIXTURE_DOT.clean, attestations: [] });
    await logInAs(page, bare.email, bare.password);

    const loads = await page.request.get('/api/marketplace/loads');
    expect(loads.status()).toBe(403);
    expect((await loads.json()).missingAttestations).toContain('profileInsurance');

    const commitments = await page.request.get('/api/commitments');
    expect(commitments.status()).toBe(403);
    expect((await commitments.json()).missingAttestations).toContain('profileAuthority');
  });

  test('returns loads, and not the poster\'s TMS plumbing among them', async ({ page }) => {
    attachPageDiagnostics(page);
    const poster = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    await seedLoad(poster.uid, {
      origin: 'Lakeland, FL',
      destination: 'Orlando, FL',
      overrides: {
        externalRefs: [
          {
            provider: 'mock',
            connectionId: 'conn-e2e-secret',
            externalId: 'BROKER-ORDER-E2E',
            url: 'https://p44.invalid/shipments/1',
            syncedAt: new Date().toISOString(),
          },
        ],
        originNodeId: 'node-lakeland',
        corridorId: 'i4-polk',
      },
    });

    const caller = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    await logInAs(page, caller.email, caller.password);

    const res = await page.request.get('/api/marketplace/loads?limit=200');
    expect(res.status()).toBe(200);
    const body = await res.json();

    // Not vacuous.
    expect(Array.isArray(body.loads)).toBe(true);
    expect(body.loads.length).toBeGreaterThan(0);

    // The matcher's inputs survived.
    const sample = body.loads[0];
    expect(sample).toHaveProperty('origin');
    expect(sample).toHaveProperty('destination');
    expect(sample).toHaveProperty('status');
    expect(sample).toHaveProperty('ownerId');

    const raw = JSON.stringify(body);
    const leaked = WITHHELD_LOAD_FIELDS.filter((f) => raw.includes(`"${f}"`));
    expect(leaked, `withheld load fields in the response: ${leaked.join(', ')}`).toEqual([]);
    expect(raw).not.toContain('conn-e2e-secret');
    expect(raw).not.toContain('BROKER-ORDER-E2E');
    expect(raw).not.toContain('p44.invalid');
  });

  test('a delivered load is not on the board', async ({ page }) => {
    attachPageDiagnostics(page);
    const poster = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    const gone = await seedLoad(poster.uid, {
      status: 'Delivered',
      origin: 'Ocala, FL',
      destination: 'Tampa, FL',
    });
    const live = await seedLoad(poster.uid, { origin: 'Ocala, FL', destination: 'Naples, FL' });

    await logInAs(page, poster.email, poster.password);
    const body = await (await page.request.get('/api/marketplace/loads?limit=500')).json();
    const ids = body.loads.map((l: { id: string }) => l.id);

    // Both halves: the filter excludes the right one AND does not exclude
    // everything, which an always-false filter would also satisfy.
    expect(ids).not.toContain(gone.id);
    expect(ids).toContain(live.id);
  });

  test('paginates rather than returning the whole board', async ({ page }) => {
    attachPageDiagnostics(page);
    const owner = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    for (let i = 0; i < 4; i++) {
      await seedLoad(owner.uid, { origin: `Lakeland, FL`, destination: `Stop ${i}, FL` });
    }
    await logInAs(page, owner.email, owner.password);

    const page1 = await (await page.request.get('/api/marketplace/loads?limit=2')).json();
    expect(page1.loads.length).toBeLessThanOrEqual(2);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await (
      await page.request.get(
        `/api/marketplace/loads?limit=2&cursor=${encodeURIComponent(page1.nextCursor)}`
      )
    ).json();

    const ids1 = page1.loads.map((l: { id: string }) => l.id);
    const ids2 = page2.loads.map((l: { id: string }) => l.id);
    expect(ids2.some((id: string) => ids1.includes(id))).toBe(false);
  });

  test('commitments carry the window and nothing of the negotiation', async ({ page }) => {
    attachPageDiagnostics(page);
    const driverOwner = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    const loadOwner = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    const load = await seedLoad(loadOwner.uid);

    // 7777 is a distinctive rate: if it appears anywhere in the response the
    // negotiation leaked. seedMatch types `status` to the pre-acceptance
    // states, so the committed one goes through overrides.
    const match = await seedMatch({
      loadOwnerId: loadOwner.uid,
      driverOwnerId: driverOwner.uid,
      driverId: 'commitment-driver',
      loadId: load.id,
      recipientOwnerId: driverOwner.uid,
      rate: 7777,
      overrides: { status: 'accepted' },
    });

    // A third carrier — employs neither party, so it should get the window
    // without the lane.
    const caller = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    await logInAs(page, caller.email, caller.password);

    const res = await page.request.get('/api/commitments');
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.complete).toBe(true);

    const mine = body.commitments.find((c: { id: string }) => c.id === match.id);
    expect(mine, 'the seeded accepted match should be a commitment').toBeTruthy();
    expect(mine.driverId).toBe('commitment-driver');
    expect(typeof mine.window.start).toBe('number');
    expect(mine.window.end).toBeGreaterThan(mine.window.start);

    // The lane belongs to the employing carrier, which this caller is not.
    expect(mine.label).toBeUndefined();
    expect(JSON.stringify(mine)).not.toContain('Boston');

    const raw = JSON.stringify(body);
    const leaked = WITHHELD_MATCH_FIELDS.filter((f) => raw.includes(`"${f}"`));
    expect(leaked, `withheld match fields in the response: ${leaked.join(', ')}`).toEqual([]);
    expect(raw).not.toContain('7777');
  });

  test('the employing carrier does get the lane', async ({ page }) => {
    attachPageDiagnostics(page);
    const driverOwner = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    const loadOwner = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    const load = await seedLoad(loadOwner.uid);
    const match = await seedMatch({
      loadOwnerId: loadOwner.uid,
      driverOwnerId: driverOwner.uid,
      driverId: 'lane-driver',
      loadId: load.id,
      recipientOwnerId: driverOwner.uid,
      overrides: { status: 'in_progress' },
    });

    await logInAs(page, driverOwner.email, driverOwner.password);
    const body = await (await page.request.get('/api/commitments')).json();
    const mine = body.commitments.find((c: { id: string }) => c.id === match.id);
    expect(mine).toBeTruthy();
    // seedMatch's loadSnapshot is Boston -> Worcester.
    expect(mine.label).toContain('Boston');
  });

  test('a pending match is not a commitment', async ({ page }) => {
    attachPageDiagnostics(page);
    const driverOwner = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    const loadOwner = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    const load = await seedLoad(loadOwner.uid);
    const pending = await seedMatch({
      loadOwnerId: loadOwner.uid,
      driverOwnerId: driverOwner.uid,
      driverId: 'not-committed-driver',
      loadId: load.id,
      recipientOwnerId: driverOwner.uid,
      status: 'pending',
    });

    await logInAs(page, driverOwner.email, driverOwner.password);
    const body = await (await page.request.get('/api/commitments')).json();
    const ids = body.commitments.map((c: { id: string }) => c.id);
    expect(ids).not.toContain(pending.id);
  });
});
