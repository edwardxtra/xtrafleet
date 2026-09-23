import { test, expect } from '@playwright/test';
import { seedOwner, logInAs, closeSeedApp, FIXTURE_DOT } from './seed';
import { attachPageDiagnostics } from './helpers';

/**
 * T6 — Admin surface authorization
 *
 * The /api/admin/* surface is the most destructive in the product: it can
 * wipe every load and driver, impersonate any user, suspend accounts and
 * reset passwords. None of it had a test.
 *
 * WHY THIS SHAPE OF TEST
 *
 * Only 4 of the 19 routes use the shared `requireAdminContext` guard; the
 * rest re-implement the same three steps (read the fb-id-token cookie,
 * verify it, load the caller's owner_operators doc and check isAdmin) by
 * hand. Fifteen hand-rolled copies of one security check is exactly the
 * shape where one copy quietly differs — a missing `!`, a check after the
 * side effect instead of before, a route added later that forgets it.
 *
 * So this asserts the property that must hold for EVERY route rather than
 * testing each one's behaviour: an anonymous caller and a signed-in
 * non-admin are both refused. A new admin route added without a guard fails
 * here as soon as it is listed, and the list is the point — keep it in step
 * with the directory.
 *
 * What this does NOT cover: what the routes do once you ARE an admin, and
 * the super_admin-vs-admin-vs-support distinction. Both are worth having and
 * are deliberately a separate piece of work; this is the floor.
 */

interface AdminRoute {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  /** Body for methods that read one. Shape only has to survive the guard. */
  body?: unknown;
  /** What this route can do if the guard fails — why it is on the list. */
  danger: string;
}

/** Every gated route under /api/admin. Keep in step with the directory. */
const ADMIN_ROUTES: AdminRoute[] = [
  { method: 'POST', path: '/api/admin/clear-data', body: { clearLoads: true }, danger: 'deletes every load, driver, match and TLA' },
  { method: 'POST', path: '/api/admin/users', body: {}, danger: 'creates accounts' },
  { method: 'PATCH', path: '/api/admin/users/SUBJECT', body: { legalName: 'Pwned Co' }, danger: 'edits any account' },
  { method: 'DELETE', path: '/api/admin/users/SUBJECT', danger: 'deletes any account' },
  { method: 'POST', path: '/api/admin/users/SUBJECT/suspend', body: { suspend: true }, danger: 'disables any account' },
  { method: 'POST', path: '/api/admin/users/SUBJECT/impersonate', body: {}, danger: 'issues a token to act as any user' },
  { method: 'POST', path: '/api/admin/users/SUBJECT/password-reset', body: {}, danger: 'triggers a password reset for any account' },
  { method: 'POST', path: '/api/admin/users/SUBJECT/send-activation', body: {}, danger: 'sends an activation link for any account' },
  { method: 'POST', path: '/api/admin/users/bulk', body: { action: 'suspend', userIds: [] }, danger: 'bulk account operations' },
  { method: 'POST', path: '/api/admin/users/auth-status', body: { userIds: [] }, danger: 'reads auth state across accounts' },
  { method: 'POST', path: '/api/admin/onboard', body: {}, danger: 'creates accounts on a user\'s behalf' },
  { method: 'POST', path: '/api/admin/drivers', body: {}, danger: 'writes drivers into any fleet' },
  { method: 'POST', path: '/api/admin/loads', body: {}, danger: 'writes loads into any fleet' },
  { method: 'POST', path: '/api/admin/attestations/void', body: {}, danger: 'voids a signed legal attestation' },
  { method: 'GET', path: '/api/admin/search', danger: 'searches across every account' },
  { method: 'GET', path: '/api/admin/conversations', danger: 'reads every conversation' },
  { method: 'GET', path: '/api/admin/conversations/SUBJECT/messages', danger: 'reads any conversation\'s messages' },
  { method: 'POST', path: '/api/admin/conversations/SUBJECT/messages/delete', body: {}, danger: 'deletes messages' },
  { method: 'GET', path: '/api/admin/health', danger: 'exposes system health' },
];

/**
 * /api/admin/impersonate/stop is deliberately NOT here. It only audit-logs
 * the END of an impersonation session, is called after the client has
 * already signed out (so there is no session left to authenticate), and
 * returns 200 even on failure by design. Asserting a 401 would encode the
 * opposite of its intent. Its lack of a guard does mean an anonymous caller
 * can append `impersonation_ended` entries to audit_logs — noted for a
 * separate decision, not silently changed here.
 */

const REFUSED = [401, 403];

test.describe('T6 — every admin route refuses a non-admin', () => {
  test.beforeEach(({ page }) => attachPageDiagnostics(page));
  test.afterAll(() => closeSeedApp());

  test('an anonymous caller is refused by every admin route', async ({ request }) => {
    const subject = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    const failures: string[] = [];

    for (const route of ADMIN_ROUTES) {
      const url = route.path.replace('SUBJECT', subject.uid);
      const res = await request.fetch(url, {
        method: route.method,
        headers: { 'content-type': 'application/json' },
        ...(route.body === undefined ? {} : { data: route.body }),
      });
      if (!REFUSED.includes(res.status())) {
        failures.push(`${route.method} ${route.path} → ${res.status()} (${route.danger})`);
      }
    }

    expect(failures, `Admin routes reachable without signing in:\n${failures.join('\n')}`).toEqual([]);
  });

  test('a signed-in NON-ADMIN owner is refused by every admin route', async ({ page }) => {
    // The more interesting case: a real, valid session that simply is not an
    // admin. A route that verifies the cookie but forgets to check isAdmin
    // passes the anonymous test above and fails here.
    const caller = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    const subject = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    await logInAs(page, caller.email, caller.password);

    const failures: string[] = [];

    for (const route of ADMIN_ROUTES) {
      const url = route.path.replace('SUBJECT', subject.uid);
      const res = await page.request.fetch(url, {
        method: route.method,
        headers: { 'content-type': 'application/json' },
        ...(route.body === undefined ? {} : { data: route.body }),
      });
      if (!REFUSED.includes(res.status())) {
        failures.push(`${route.method} ${route.path} → ${res.status()} (${route.danger})`);
      }
    }

    expect(failures, `Admin routes reachable by a signed-in non-admin:\n${failures.join('\n')}`).toEqual([]);
  });

  test('a refused clear-data call deletes nothing', async ({ page }) => {
    // The refusals above are only worth anything if the side effect really
    // did not happen. clear-data is the one where that matters most.
    const caller = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
    await logInAs(page, caller.email, caller.password);

    const res = await page.request.post('/api/admin/clear-data', {
      headers: { 'content-type': 'application/json' },
      data: { clearLoads: true, clearDrivers: true, clearMatches: true, clearTLAs: true },
    });
    expect(REFUSED).toContain(res.status());

    // The caller's own account must still be there — a wipe would have taken
    // the whole owner_operators tree with it.
    const stillThere = await page.request.get('/api/admin/health');
    expect(REFUSED).toContain(stillThere.status());
  });
});
