import { test, expect, type Browser } from '@playwright/test';
import { seedOwner, logInAs, closeSeedApp, FIXTURE_DOT } from './seed';
import { attachPageDiagnostics } from './helpers';
import type { AdminRole } from '../../src/lib/admin-roles';

/**
 * T8 — Admin privilege separation
 *
 * T6 pins that NON-admins are refused everywhere. This pins the next layer:
 * that being an admin is not the same as being every admin.
 *
 * 18 of the 19 admin routes do check a permission or an explicit role, not
 * just `isAdmin` — which is better than the auth situation T6 found. But
 * nothing verified it, so a permission quietly widened in ROLE_PERMISSIONS,
 * or a route switching from hasPermission() to a bare isAdmin check, would
 * have gone unnoticed.
 *
 * The cases below are the ones where the blast radius is largest: a plain
 * `admin` must not be able to wipe the database or impersonate a user, and
 * `support` — a view-only role — must not be able to write anything.
 *
 * NOTE ON clear-data: only its REFUSALS are exercised. A successful call
 * deletes every load, driver, match and TLA in the project, which would take
 * the rest of the suite's seeded data with it.
 */

interface RoleCase {
  role: AdminRole;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  why: string;
}

/** (role, route) pairs that MUST be refused. */
const MUST_REFUSE: RoleCase[] = [
  // super_admin only — the two most destructive things in the product.
  { role: 'admin', method: 'POST', path: '/api/admin/clear-data', body: { clearLoads: true },
    why: 'wiping all data is super_admin only' },
  { role: 'admin', method: 'POST', path: '/api/admin/users/SUBJECT/impersonate', body: {},
    why: 'impersonation is super_admin only' },
  { role: 'support', method: 'POST', path: '/api/admin/clear-data', body: { clearLoads: true },
    why: 'support is view-only' },
  { role: 'billing_admin', method: 'POST', path: '/api/admin/clear-data', body: { clearLoads: true },
    why: 'billing_admin is view-only outside billing' },

  // support holds only :view permissions — every write must be refused.
  { role: 'support', method: 'POST', path: '/api/admin/users', body: {}, why: 'no users:create' },
  { role: 'support', method: 'PATCH', path: '/api/admin/users/SUBJECT', body: { legalName: 'X' },
    why: 'no users:edit' },
  { role: 'support', method: 'POST', path: '/api/admin/users/SUBJECT/suspend', body: { suspend: true },
    why: 'no users:suspend' },
  { role: 'support', method: 'POST', path: '/api/admin/drivers', body: {}, why: 'no drivers:edit' },
  { role: 'support', method: 'POST', path: '/api/admin/loads', body: {}, why: 'no loads:edit' },
  { role: 'support', method: 'POST', path: '/api/admin/attestations/void', body: {}, why: 'no tlas:void' },
  { role: 'support', method: 'POST', path: '/api/admin/onboard', body: {}, why: 'no users:create' },

  // billing_admin holds billing + :view only.
  { role: 'billing_admin', method: 'POST', path: '/api/admin/drivers', body: {}, why: 'no drivers:edit' },
  { role: 'billing_admin', method: 'POST', path: '/api/admin/loads', body: {}, why: 'no loads:edit' },
  { role: 'billing_admin', method: 'POST', path: '/api/admin/users', body: {}, why: 'no users:create' },
];

/** (role, route) pairs that must be ALLOWED — so the suite is not vacuous. */
const MUST_ALLOW: RoleCase[] = [
  { role: 'support', method: 'GET', path: '/api/admin/search?q=test', why: 'support holds audit:view' },
  { role: 'support', method: 'GET', path: '/api/admin/health', why: 'support holds audit:view' },
  { role: 'billing_admin', method: 'POST', path: '/api/admin/users/auth-status', body: { emails: [] },
    why: 'billing_admin holds users:view' },
];

/**
 * 403 only, deliberately not 401.
 *
 * 401 is "we don't know who you are" — if a login silently stopped carrying,
 * every route would answer 401 and a test that accepted it would pass while
 * measuring nothing. 403 is the thing being pinned: we know exactly who you
 * are, and you still may not do this. All 14 refusals below are observed 403s.
 */
const REFUSED = [403];

/**
 * Contexts made with browser.newContext() do not inherit `use.baseURL` from
 * the config, so the relative paths above would resolve against nothing.
 * Same default as playwright.config.ts.
 */
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:9002';

async function seedAdmin(role: AdminRole) {
  return seedOwner({
    dotNumber: FIXTURE_DOT.clean,
    overrides: { isAdmin: true, adminRole: role },
  });
}

test.describe('T8 — an admin is not every admin', () => {
  // Each case needs a logged-in browser session, and a login is a full page
  // load plus a Firestore round trip. Grouping the cases by role keeps that
  // to one login per role rather than one per case, but three logins plus
  // seeding still does not fit in Playwright's 30s default.
  test.describe.configure({ timeout: 180_000 });

  test.afterAll(() => closeSeedApp());

  /**
   * Run every case for one role under a single login.
   *
   * Each role gets its own browser context. Two reasons: it is what the
   * scenario actually is (a different person, a different session), and
   * logging a second account in on a page that already holds a session
   * leaves the Firestore web channel torn down — sign-in then fails on the
   * profile read with "client is offline", which looks like a product bug
   * and isn't one.
   */
  async function runCases(
    browser: Browser,
    cases: RoleCase[],
    subjectUid: string,
    judge: (c: RoleCase, status: number) => string | null,
  ): Promise<string[]> {
    const failures: string[] = [];
    const byRole = new Map<AdminRole, RoleCase[]>();
    for (const c of cases) {
      if (!byRole.has(c.role)) byRole.set(c.role, []);
      byRole.get(c.role)!.push(c);
    }

    for (const [role, roleCases] of byRole) {
      const admin = await seedAdmin(role);
      const context = await browser.newContext({ baseURL: BASE_URL });
      try {
        const page = await context.newPage();
        attachPageDiagnostics(page);
        await logInAs(page, admin.email, admin.password);

        for (const c of roleCases) {
          const res = await page.request.fetch(c.path.replace('SUBJECT', subjectUid), {
            method: c.method,
            headers: { 'content-type': 'application/json' },
            ...(c.body === undefined ? {} : { data: c.body }),
          });
          const failure = judge(c, res.status());
          if (failure) failures.push(failure);
        }
      } finally {
        await context.close();
      }
    }
    return failures;
  }

  test('privileged routes refuse admins who lack the permission', async ({ browser }) => {
    const subject = await seedOwner({ dotNumber: FIXTURE_DOT.clean });

    const failures = await runCases(browser, MUST_REFUSE, subject.uid, (c, status) =>
      REFUSED.includes(status)
        ? null
        : `${c.role} reached ${c.method} ${c.path} → ${status} (${c.why})`,
    );

    expect(failures, `Privilege separation broken:\n${failures.join('\n')}`).toEqual([]);
  });

  test('routes a role DOES hold permission for are not blanket-refused', async ({ browser }) => {
    // Without this the suite would pass just as happily if every admin route
    // started returning 403 to everyone. None of these paths carry SUBJECT.
    const failures = await runCases(browser, MUST_ALLOW, '', (c, status) =>
      REFUSED.includes(status)
        ? `${c.role} was refused ${c.method} ${c.path} → ${status} (${c.why})`
        : null,
    );

    expect(failures, `Permissions too narrow:\n${failures.join('\n')}`).toEqual([]);
  });

  test('a legacy admin with no adminRole field is not silently a super admin', async ({ page }) => {
    // Accounts predating the role model have isAdmin but no adminRole.
    // getDefaultRoleForLegacyAdmin decides what they get; whatever it is, it
    // must not be the role that can wipe the database.
    const legacy = await seedOwner({
      dotNumber: FIXTURE_DOT.clean,
      overrides: { isAdmin: true },
    });
    await logInAs(page, legacy.email, legacy.password);

    const res = await page.request.post('/api/admin/clear-data', {
      headers: { 'content-type': 'application/json' },
      data: { clearLoads: true, clearDrivers: true, clearMatches: true, clearTLAs: true },
    });
    expect(REFUSED).toContain(res.status());
  });
});
