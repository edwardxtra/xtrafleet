import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, setLogLevel } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Firestore rules integration tests (DEV-157 Phase 2).
 *
 * Spin up an in-memory Firestore emulator, load the production rules,
 * and exercise the access patterns that DEV-95 + DEV-162 + DEV-158 set
 * up. Each test runs as a fresh signed-in user — no cross-test state.
 *
 * Patent-relevant invariants verified here:
 *   - Clients cannot create TLAs (server-only path via /api/matches/accept).
 *   - Non-parties cannot update a match or TLA.
 *   - Pre-activated owner_operator docs are not readable by strangers.
 *   - audit_logs are append-only.
 *   - activation_tokens are not client-readable.
 */

let env: RulesTestEnvironment;

const PROJECT_ID = 'xtrafleet-rules-test';

// Quiet the noisy firebase warnings during the run.
setLogLevel('error');

beforeAll(async () => {
  const rules = readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8');
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

// --- helpers --------------------------------------------------------------

function asUser(uid: string) {
  return env.authenticatedContext(uid).firestore();
}
function asUnauth() {
  return env.unauthenticatedContext().firestore();
}

/** Seed an owner_operator doc as admin (bypasses rules) with the given fields. */
async function seedOwner(uid: string, data: Record<string, unknown> = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'owner_operators', uid), {
      legalName: `Owner ${uid}`,
      contactEmail: `${uid}@example.com`,
      accountStatus: 'active',
      isAdmin: false,
      ...data,
    });
  });
}

/** Seed an admin (regular or super) owner_operator. */
async function seedAdmin(uid: string, role: 'admin' | 'super_admin' = 'admin') {
  await seedOwner(uid, { isAdmin: true, adminRole: role });
}

/**
 * Seed an owner_operator with NO `isAdmin` / `adminRole` fields at all (DEV-199).
 *
 * This is what most real documents look like — the fields are absent, not
 * false. `seedOwner` always writes `isAdmin: false`, which is precisely why
 * the missing-field behaviour went unnoticed: every existing test seeded a
 * document that the old direct-read helpers could evaluate.
 *
 * Deliberately does NOT go through seedOwner, so no default can creep in.
 */
async function seedLegacyOwner(uid: string, data: Record<string, unknown> = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'owner_operators', uid), {
      legalName: `Owner ${uid}`,
      contactEmail: `${uid}@example.com`,
      accountStatus: 'active',
      ...data,
    });
  });
}

/** Seed a match doc with the given party uids. */
async function seedMatch(
  matchId: string,
  fields: { loadOwnerId: string; driverOwnerId: string; driverId: string; status?: string }
) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'matches', matchId), {
      status: 'pending',
      ...fields,
    });
  });
}

/** Seed a TLA doc with party owner-operator ids. */
async function seedTLA(
  tlaId: string,
  fields: { lessorOwnerId: string; lesseeOwnerId: string; status?: string }
) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'tlas', tlaId), {
      status: 'pending_lessor',
      lessor: { ownerOperatorId: fields.lessorOwnerId, legalName: 'Lessor', contactEmail: '' },
      lessee: { ownerOperatorId: fields.lesseeOwnerId, legalName: 'Lessee', contactEmail: '' },
      ...fields,
    });
  });
}

// --- owner_operators: pre-activated visibility (DEV-158) ------------------

describe('owner_operators — pre-activated visibility (DEV-158)', () => {
  it('strangers cannot read a pre-activated owner_operator', async () => {
    await seedOwner('alice', { accountStatus: 'pre-activated' });
    await seedOwner('bob');
    await assertFails(getDoc(doc(asUser('bob'), 'owner_operators/alice')));
  });

  it('the pre-activated user themselves can read their own doc', async () => {
    await seedOwner('alice', { accountStatus: 'pre-activated' });
    await assertSucceeds(getDoc(doc(asUser('alice'), 'owner_operators/alice')));
  });

  it('an admin can read a pre-activated owner_operator', async () => {
    await seedOwner('alice', { accountStatus: 'pre-activated' });
    await seedAdmin('admin1');
    await assertSucceeds(getDoc(doc(asUser('admin1'), 'owner_operators/alice')));
  });

  it('strangers CAN read an active owner_operator (marketplace lookups)', async () => {
    await seedOwner('alice', { accountStatus: 'active' });
    await seedOwner('bob');
    await assertSucceeds(getDoc(doc(asUser('bob'), 'owner_operators/alice')));
  });

  // Admin-console user creation is server-only (POST /api/admin/users): even an
  // admin cannot create someone else's owner_operator doc from the browser.
  it('an admin cannot create an owner_operator for someone else', async () => {
    await seedAdmin('admin1');
    await assertFails(
      setDoc(doc(asUser('admin1'), 'owner_operators/new-customer'), {
        companyName: 'Eds Trucking',
        contactEmail: 'e.dj@example.com',
        accountStatus: 'pre-activated',
      })
    );
  });

  it('a user can still create their own owner_operator doc (self-registration)', async () => {
    await assertSucceeds(
      setDoc(doc(asUser('carol'), 'owner_operators/carol'), {
        companyName: 'Carol Trucking',
        contactEmail: 'carol@example.com',
      })
    );
  });
});

// --- owner_operators: privilege escalation guard --------------------------

/**
 * isAdmin()/isSuperAdmin() read `isAdmin`/`adminRole` off the caller's own
 * owner_operators doc. Before this guard, `allow update: isOwner(...)` placed
 * no restriction on WHICH fields a holder could write, so any signed-in
 * owner-operator could promote themselves to super_admin in one write and
 * then reach the admin console and the impersonation endpoint.
 */
describe('owner_operators — self-write privilege guard', () => {
  it('a user CANNOT make themselves an admin', async () => {
    await seedOwner('mallory');
    await assertFails(
      updateDoc(doc(asUser('mallory'), 'owner_operators/mallory'), { isAdmin: true })
    );
  });

  it('a user CANNOT give themselves an adminRole', async () => {
    await seedOwner('mallory');
    await assertFails(
      updateDoc(doc(asUser('mallory'), 'owner_operators/mallory'), {
        adminRole: 'super_admin',
      })
    );
  });

  it('the full escalation chain is dead: no self-promote, so no admin read', async () => {
    await seedOwner('mallory');
    await seedOwner('victim', { accountStatus: 'pre-activated' });
    await assertFails(
      updateDoc(doc(asUser('mallory'), 'owner_operators/mallory'), {
        isAdmin: true,
        adminRole: 'super_admin',
      })
    );
    // The promotion never landed, so the pre-activated doc stays unreadable.
    await assertFails(getDoc(doc(asUser('mallory'), 'owner_operators/victim')));
  });

  it('a suspended user CANNOT un-suspend themselves', async () => {
    await seedOwner('mallory', { isSuspended: true });
    await assertFails(
      updateDoc(doc(asUser('mallory'), 'owner_operators/mallory'), { isSuspended: false })
    );
  });

  it('a user CANNOT grant themselves a subscription', async () => {
    await seedOwner('mallory', { subscriptionStatus: 'inactive' });
    await assertFails(
      updateDoc(doc(asUser('mallory'), 'owner_operators/mallory'), {
        subscriptionStatus: 'active',
      })
    );
  });

  it('a user CANNOT flip their own accountStatus', async () => {
    await seedOwner('mallory', { accountStatus: 'pre-activated' });
    await assertFails(
      updateDoc(doc(asUser('mallory'), 'owner_operators/mallory'), {
        accountStatus: 'active',
      })
    );
  });

  it('a user CANNOT create their own doc pre-loaded with isAdmin', async () => {
    await assertFails(
      setDoc(doc(asUser('mallory'), 'owner_operators/mallory'), {
        companyName: 'Mallory Trucking',
        contactEmail: 'mallory@example.com',
        isAdmin: true,
      })
    );
  });
});

// --- owner_operators: legitimate writes still work ------------------------

describe('owner_operators — the guard does not break real flows', () => {
  it('a user can still edit their own profile fields', async () => {
    await seedOwner('carol');
    await assertSucceeds(
      updateDoc(doc(asUser('carol'), 'owner_operators/carol'), {
        companyName: 'Carol Trucking LLC',
        phone: '5551234567',
        city: 'Tampa',
      })
    );
  });

  it('a user can still advance their own onboardingStatus', async () => {
    await seedOwner('carol');
    await assertSucceeds(
      updateDoc(doc(asUser('carol'), 'owner_operators/carol'), {
        'onboardingStatus.profileComplete': true,
        'onboardingStatus.fmcsaDesignated': 'pending',
      })
    );
  });

  it('a user can still append an attestation to their own doc', async () => {
    await seedOwner('carol', { attestations: [] });
    await assertSucceeds(
      updateDoc(doc(asUser('carol'), 'owner_operators/carol'), {
        attestations: [{ type: 'profileInsurance', acceptedAt: '2026-01-01' }],
      })
    );
  });

  it("the /login incomplete-registration repair path still works", async () => {
    await assertSucceeds(
      setDoc(doc(asUser('carol'), 'owner_operators/carol'), {
        id: 'carol',
        contactEmail: 'carol@example.com',
        companyName: '',
        subscriptionStatus: 'inactive',
        createdAt: '2026-01-01T00:00:00.000Z',
      })
    );
  });

  it('a super_admin can still grant admin via /admin/settings', async () => {
    await seedAdmin('root', 'super_admin');
    await seedOwner('carol');
    await assertSucceeds(
      updateDoc(doc(asUser('root'), 'owner_operators/carol'), {
        isAdmin: true,
        adminRole: 'admin',
        adminRoleUpdatedBy: 'root',
      })
    );
  });

  it('a super_admin can still revoke admin', async () => {
    await seedAdmin('root', 'super_admin');
    await seedOwner('carol', { isAdmin: true, adminRole: 'admin' });
    await assertSucceeds(
      updateDoc(doc(asUser('root'), 'owner_operators/carol'), {
        isAdmin: false,
        adminRole: null,
        adminRevokedBy: 'root',
      })
    );
  });

  it('a super_admin can still suspend a user', async () => {
    await seedAdmin('root', 'super_admin');
    await seedOwner('carol');
    await assertSucceeds(
      updateDoc(doc(asUser('root'), 'owner_operators/carol'), {
        isSuspended: true,
        suspendedReason: 'non-payment',
        suspendedBy: 'root',
      })
    );
  });
});

// --- isAdmin()/isSuperAdmin() on documents missing the field (DEV-199) ----

describe('isAdmin()/isSuperAdmin() — documents with no isAdmin field', () => {
  /**
   * Before DEV-199 these helpers read `.data.isAdmin` directly. Reading a
   * missing property in Firestore rules is an ERROR, not false, so for the
   * many owner_operators documents that carry no `isAdmin` field the helpers
   * threw rather than returning false.
   *
   * The outcome was never insecure — an evaluation error denies the request
   * too — but a denial-by-error is indistinguishable from a rules bug when
   * you are staring at the Rules Playground, which is what cost time while
   * verifying the privilege-escalation guard:
   *
   *   Error: simulator.rules line [23], column [9].
   *   Property isAdmin is undefined on object.
   *
   * These tests pin the clean-false behaviour. Each one drives a path where
   * short-circuit evaluation does NOT spare the helper — otherwise it would
   * pass with or without the fix and prove nothing.
   */

  it('denies (not errors) reading a pre-activated doc — isAdmin() is actually reached', async () => {
    // The get rule is: not-pre-activated || isOwner || isAdmin().
    // A pre-activated doc read by a stranger fails the first two, so
    // isAdmin() is genuinely evaluated. This is the exact call that threw.
    await seedLegacyOwner('legacy-user');
    await seedOwner('newbie', { accountStatus: 'pre-activated' });
    await assertFails(getDoc(doc(asUser('legacy-user'), 'owner_operators/newbie')));
  });

  it('denies a users/{uid} delete — isSuperAdmin() is actually reached', async () => {
    // users/{userId} delete is gated on isSuperAdmin() alone, with nothing
    // ahead of it to short-circuit.
    await seedLegacyOwner('legacy-user');
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'someone-else'), { email: 'x@example.com' });
    });
    await assertFails(deleteDoc(doc(asUser('legacy-user'), 'users/someone-else')));
  });

  it('denies self-promotion from a doc with no isAdmin field', async () => {
    await seedLegacyOwner('mallory');
    await assertFails(
      updateDoc(doc(asUser('mallory'), 'owner_operators/mallory'), { isAdmin: true })
    );
  });

  it('still allows an ordinary self-edit from a doc with no isAdmin field', async () => {
    // Short-circuits before isAdmin(), so this passed before the fix too —
    // kept as the regression guard that the fix changed nothing for real users.
    await seedLegacyOwner('carol');
    await assertSucceeds(
      updateDoc(doc(asUser('carol'), 'owner_operators/carol'), {
        legalName: 'Carol Hauling LLC',
        city: 'Providence',
      })
    );
  });

  it('treats an admin with isAdmin but no adminRole as not-super', async () => {
    // isSuperAdmin() reads adminRole, which is absent here. Previously that
    // second read errored; now it defaults to '' and cleanly fails the
    // super_admin comparison. A plain admin must not inherit super powers
    // just because the role field was never written.
    await seedLegacyOwner('half-admin', { isAdmin: true });
    await seedOwner('victim');
    await assertFails(
      updateDoc(doc(asUser('half-admin'), 'owner_operators/victim'), { isSuspended: true })
    );
  });

  it('does not change behaviour for a real super_admin', async () => {
    await seedAdmin('root', 'super_admin');
    await seedOwner('carol');
    await assertSucceeds(
      updateDoc(doc(asUser('root'), 'owner_operators/carol'), {
        isSuspended: true,
        suspendedBy: 'root',
      })
    );
  });

  it('does not change behaviour for a real admin reading a pre-activated doc', async () => {
    await seedAdmin('helper', 'admin');
    await seedOwner('newbie', { accountStatus: 'pre-activated' });
    await assertSucceeds(getDoc(doc(asUser('helper'), 'owner_operators/newbie')));
  });

  /**
   * The assertions above cannot, on their own, catch the bug they describe.
   *
   * A rules evaluation error denies the request exactly as `false` does, and
   * every use of isAdmin()/isSuperAdmin() in firestore.rules sits last in its
   * OR chain — so no clause runs after them where the two outcomes would
   * diverge. To a client, error and false are the same DENIED. All seven
   * tests above pass against the pre-fix rules too.
   *
   * The distinction is only visible in the emulator's rule-coverage report,
   * which records the failing expression's causeMessage:
   *
   *   Property isAdmin is undefined on object.
   *
   * So this asserts on that report. Coverage accumulates across the whole
   * file (clearFirestore does not reset it), which makes this a stronger
   * check than a per-test one: no rule evaluated anywhere in this suite may
   * fail by reading a property that isn't there. Revert the .data.get()
   * helpers and this goes red while everything else stays green.
   *
   * Depends on running after the tests that exercise the missing-field docs,
   * which within a file it does — vitest preserves declaration order.
   */
  it('leaves no undefined-property evaluation errors anywhere in the suite', async () => {
    const res = await fetch(
      `http://127.0.0.1:8080/emulator/v1/projects/${PROJECT_ID}:ruleCoverage?type=json`
    );
    expect(res.ok).toBe(true);

    const coverage = await res.json();

    // causeMessage is nested at varying depths; walk the whole report.
    const causes: string[] = [];
    JSON.stringify(coverage.report, (key, value) => {
      if (key === 'causeMessage' && typeof value === 'string') causes.push(value);
      return value;
    });

    const undefinedProperty = causes.filter((c) => /is undefined on object/.test(c));
    expect(
      undefinedProperty,
      `Rules read a property that does not exist. Use .data.get(field, default) ` +
        `instead of .data.field. Offending: ${[...new Set(undefinedProperty)].join(' | ')}`
    ).toEqual([]);
  });
});

// --- matches: party-or-admin update/delete (DEV-95) -----------------------

describe('matches — party-or-admin write (DEV-95)', () => {
  beforeEach(async () => {
    await seedMatch('m1', {
      loadOwnerId: 'load-owner',
      driverOwnerId: 'driver-owner',
      driverId: 'driver-uid',
    });
  });

  it('load owner can update their match', async () => {
    await seedOwner('load-owner');
    await assertSucceeds(
      updateDoc(doc(asUser('load-owner'), 'matches/m1'), { status: 'countered' })
    );
  });

  it('driver owner can update the match', async () => {
    await seedOwner('driver-owner');
    await assertSucceeds(
      updateDoc(doc(asUser('driver-owner'), 'matches/m1'), { status: 'cancelled' })
    );
  });

  it('driver themselves can update the match', async () => {
    await seedOwner('driver-uid');
    await assertSucceeds(
      updateDoc(doc(asUser('driver-uid'), 'matches/m1'), { status: 'acknowledged' })
    );
  });

  it('admin can update any match', async () => {
    await seedAdmin('admin1');
    await assertSucceeds(
      updateDoc(doc(asUser('admin1'), 'matches/m1'), { status: 'cancelled' })
    );
  });

  it('an unrelated signed-in user cannot update someone else\'s match', async () => {
    await seedOwner('stranger');
    await assertFails(
      updateDoc(doc(asUser('stranger'), 'matches/m1'), { status: 'declined' })
    );
  });

  it('unauthenticated users cannot update a match', async () => {
    await assertFails(updateDoc(doc(asUnauth(), 'matches/m1'), { status: 'declined' }));
  });

  it('load owner can delete their match', async () => {
    await seedOwner('load-owner');
    await assertSucceeds(deleteDoc(doc(asUser('load-owner'), 'matches/m1')));
  });

  it('driver owner CANNOT delete a match (only load owner or super_admin)', async () => {
    await seedOwner('driver-owner');
    await assertFails(deleteDoc(doc(asUser('driver-owner'), 'matches/m1')));
  });

  it('regular admin CANNOT delete a match', async () => {
    await seedAdmin('admin1', 'admin');
    await assertFails(deleteDoc(doc(asUser('admin1'), 'matches/m1')));
  });

  it('super_admin can delete a match', async () => {
    await seedAdmin('superadmin', 'super_admin');
    await assertSucceeds(deleteDoc(doc(asUser('superadmin'), 'matches/m1')));
  });
});

// --- tlas: server-only create + party-or-admin update (DEV-162 / DEV-95) ---

describe('tlas — create is server-only, update is party-or-admin (DEV-162, DEV-95)', () => {
  it('clients cannot create a TLA (patent-critical: compliance gate cannot be bypassed)', async () => {
    await seedOwner('lessor');
    await assertFails(
      setDoc(doc(asUser('lessor'), 'tlas/t1'), {
        status: 'pending_lessor',
        lessor: { ownerOperatorId: 'lessor' },
        lessee: { ownerOperatorId: 'lessee' },
      })
    );
  });

  it('lessor party can update their TLA', async () => {
    await seedTLA('t1', { lessorOwnerId: 'lessor', lesseeOwnerId: 'lessee' });
    await seedOwner('lessor');
    await assertSucceeds(updateDoc(doc(asUser('lessor'), 'tlas/t1'), { status: 'signed' }));
  });

  it('lessee party can update their TLA', async () => {
    await seedTLA('t1', { lessorOwnerId: 'lessor', lesseeOwnerId: 'lessee' });
    await seedOwner('lessee');
    await assertSucceeds(
      updateDoc(doc(asUser('lessee'), 'tlas/t1'), { status: 'pending_lessor' })
    );
  });

  it('admin can update any TLA', async () => {
    await seedTLA('t1', { lessorOwnerId: 'lessor', lesseeOwnerId: 'lessee' });
    await seedAdmin('admin1');
    await assertSucceeds(updateDoc(doc(asUser('admin1'), 'tlas/t1'), { status: 'voided' }));
  });

  it('unrelated signed-in user cannot update a TLA', async () => {
    await seedTLA('t1', { lessorOwnerId: 'lessor', lesseeOwnerId: 'lessee' });
    await seedOwner('stranger');
    await assertFails(
      updateDoc(doc(asUser('stranger'), 'tlas/t1'), { status: 'voided' })
    );
  });

  it('only super_admin can delete a TLA', async () => {
    await seedTLA('t1', { lessorOwnerId: 'lessor', lesseeOwnerId: 'lessee' });
    await seedAdmin('regular-admin', 'admin');
    await seedAdmin('superadmin', 'super_admin');
    await assertFails(deleteDoc(doc(asUser('regular-admin'), 'tlas/t1')));
    await seedTLA('t2', { lessorOwnerId: 'lessor', lesseeOwnerId: 'lessee' });
    await assertSucceeds(deleteDoc(doc(asUser('superadmin'), 'tlas/t2')));
  });
});

// --- audit_logs: append-only --------------------------------------------------

describe('audit_logs — append-only', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'audit_logs/log1'), {
        userId: 'alice',
        action: 'user_created',
        timestamp: new Date().toISOString(),
      });
    });
  });

  it('signed-in users can create audit log entries', async () => {
    await seedOwner('alice');
    await assertSucceeds(
      setDoc(doc(asUser('alice'), 'audit_logs/new1'), {
        userId: 'alice',
        action: 'user_updated',
        timestamp: new Date().toISOString(),
      })
    );
  });

  it('the user who owns a log can read it', async () => {
    await seedOwner('alice');
    await assertSucceeds(getDoc(doc(asUser('alice'), 'audit_logs/log1')));
  });

  it('admins can read any audit log', async () => {
    await seedAdmin('admin1');
    await assertSucceeds(getDoc(doc(asUser('admin1'), 'audit_logs/log1')));
  });

  it('other users cannot read someone else\'s audit log', async () => {
    await seedOwner('bob');
    await assertFails(getDoc(doc(asUser('bob'), 'audit_logs/log1')));
  });

  it('NO ONE can update an audit log entry (append-only)', async () => {
    await seedOwner('alice');
    await seedAdmin('admin1', 'super_admin');
    await assertFails(updateDoc(doc(asUser('alice'), 'audit_logs/log1'), { action: 'tampered' }));
    await assertFails(updateDoc(doc(asUser('admin1'), 'audit_logs/log1'), { action: 'tampered' }));
  });

  it('NO ONE can delete an audit log entry (append-only)', async () => {
    await seedOwner('alice');
    await seedAdmin('admin1', 'super_admin');
    await assertFails(deleteDoc(doc(asUser('alice'), 'audit_logs/log1')));
    await assertFails(deleteDoc(doc(asUser('admin1'), 'audit_logs/log1')));
  });
});

// --- payments: server-only writes, admin-only reads (DEV-84) -------------

describe('payments — server-only writes, admin-only reads (DEV-84)', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'payments/pi_test1'), {
        type: 'match_fee',
        amount: 2500,
        status: 'succeeded',
        tlaId: 't1',
        ownerOperatorId: 'load-owner',
        createdAt: new Date().toISOString(),
      });
    });
  });

  it('admins can read any payment', async () => {
    await seedAdmin('admin1');
    await assertSucceeds(getDoc(doc(asUser('admin1'), 'payments/pi_test1')));
  });

  it('regular signed-in users cannot read payments', async () => {
    await seedOwner('load-owner');
    await assertFails(getDoc(doc(asUser('load-owner'), 'payments/pi_test1')));
  });

  it('no one can write a payment from the client (server-only)', async () => {
    await seedOwner('load-owner');
    await seedAdmin('admin1', 'super_admin');
    await assertFails(
      setDoc(doc(asUser('load-owner'), 'payments/new1'), { type: 'match_fee' })
    );
    await assertFails(
      setDoc(doc(asUser('admin1'), 'payments/new1'), { type: 'match_fee' })
    );
  });
});

// --- activation_tokens: server-only (DEV-158) -----------------------------

describe('activation_tokens — server-only (DEV-158)', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'activation_tokens/tok1'), {
        ownerOperatorId: 'alice',
        tokenHash: 'fakehash',
        expiresAt: new Date(Date.now() + 1e7).toISOString(),
        consumedAt: null,
      });
    });
  });

  it('signed-in users cannot read activation tokens', async () => {
    await seedOwner('alice');
    await assertFails(getDoc(doc(asUser('alice'), 'activation_tokens/tok1')));
  });

  it('admins cannot read activation tokens', async () => {
    await seedAdmin('admin1', 'super_admin');
    await assertFails(getDoc(doc(asUser('admin1'), 'activation_tokens/tok1')));
  });

  it('signed-in users cannot write activation tokens', async () => {
    await seedOwner('alice');
    await assertFails(
      setDoc(doc(asUser('alice'), 'activation_tokens/new1'), { tokenHash: 'attempt' })
    );
  });
});
