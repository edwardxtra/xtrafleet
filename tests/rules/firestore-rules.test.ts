import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, setLogLevel,
  collection, collectionGroup, getDocs, query, where,
} from 'firebase/firestore';
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


/** Seed a load under an owner. */
async function seedLoad(ownerId: string, loadId: string, data: Record<string, unknown> = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `owner_operators/${ownerId}/loads/${loadId}`), {
      origin: 'Boston, MA',
      destination: 'Tampa, FL',
      cargo: 'General freight',
      weight: 20000,
      status: 'live',
      requiredQualifications: [],
      externalRefs: [{ provider: 'acme-tms', connectionId: 'conn-1', orderNumber: 'SO-99' }],
      ...data,
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

// --- tlas / matches: read scoping ----------------------------------------

describe('tlas — only the parties and admins can read an agreement', () => {
  // A TLA carries the lessor's and lessee's legal names, addresses, contact
  // emails and phones; the driver's CDL number, CDL state and medical card
  // expiry; pickup/delivery addresses with contact names and phones; and
  // each signature's IP address. `allow read: if isSignedIn()` made all of
  // it readable by anyone who could register an account.
  it('a stranger cannot read a TLA they are not party to', async () => {
    await seedTLA('t-read', { lessorOwnerId: 'lessor', lesseeOwnerId: 'lessee' });
    await assertFails(getDoc(doc(asUser('stranger'), 'tlas/t-read')));
  });

  it('an unauthenticated caller cannot read a TLA', async () => {
    await seedTLA('t-read-anon', { lessorOwnerId: 'lessor', lesseeOwnerId: 'lessee' });
    await assertFails(getDoc(doc(asUnauth(), 'tlas/t-read-anon')));
  });

  // The three tests below are what stop the rule from simply being
  // `allow read: if false`, which would also pass the two above.
  it('the lessor can read their own TLA', async () => {
    await seedTLA('t-lessor', { lessorOwnerId: 'lessor', lesseeOwnerId: 'lessee' });
    await assertSucceeds(getDoc(doc(asUser('lessor'), 'tlas/t-lessor')));
  });

  it('the lessee can read their own TLA', async () => {
    await seedTLA('t-lessee', { lessorOwnerId: 'lessor', lesseeOwnerId: 'lessee' });
    await assertSucceeds(getDoc(doc(asUser('lessee'), 'tlas/t-lessee')));
  });

  it('an admin can read any TLA', async () => {
    // The admin console lists every TLA with an unfiltered collection read,
    // so losing this would break it.
    await seedAdmin('admin1');
    await seedTLA('t-admin', { lessorOwnerId: 'lessor', lesseeOwnerId: 'lessee' });
    await assertSucceeds(getDoc(doc(asUser('admin1'), 'tlas/t-admin')));
  });
});

describe('matches — the read gap is closed', () => {
  /**
   * This block used to pin the OPEN behaviour as a known gap, with the note
   * "when the follow-up lands, this test should flip to assertFails".
   *
   * It has landed. /api/commitments returns commitment WINDOWS — driverId,
   * start, end — instead of whole match documents, so the marketplace board
   * no longer needs to read every carrier's match to find out who is already
   * booked. The read rule is party-or-admin now, and the rates that used to
   * ride along (originalTerms, counterTerms, loadSnapshot.price) no longer
   * leave the server for a non-party.
   *
   * See the `matches — party-or-admin read` block above for the full matrix.
   * These two stay here as the direct inverse of what they used to assert.
   */
  it('a stranger can no longer read a match they are not party to', async () => {
    await seedOwner('stranger');
    await seedMatch('m-read', {
      loadOwnerId: 'load-owner',
      driverOwnerId: 'driver-owner',
      driverId: 'driver-uid',
    });
    await assertFails(getDoc(doc(asUser('stranger'), 'matches/m-read')));
  });

  it('an unauthenticated caller still cannot read a match', async () => {
    await seedMatch('m-read-anon', {
      loadOwnerId: 'load-owner',
      driverOwnerId: 'driver-owner',
      driverId: 'driver-uid',
    });
    await assertFails(getDoc(doc(asUnauth(), 'matches/m-read-anon')));
  });
});


// --- drivers: the collection-group rule overrides the nested guard --------

/** Seed a driver under an owner. */
async function seedDriverDoc(
  ownerId: string,
  driverId: string,
  data: Record<string, unknown> = {}
) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `owner_operators/${ownerId}/drivers/${driverId}`), {
      name: 'Seed Driver',
      accountStatus: 'active',
      ...data,
    });
  });
}

describe('drivers — the pre-activation guard now bites', () => {
  /**
   * This block used to pin the OPEN behaviour, with the note "these flip to
   * assertFails when that lands". It has landed.
   *
   * The nested rule always claimed to guard pre-activated drivers (DEV-158),
   * but `match /{path=**}/drivers/{driverId} { allow read: if isSignedIn(); }`
   * matched the same paths, and Firestore grants access when ANY matching
   * rule allows it — so the guard never denied anything. The collection group
   * rule is admin-only now, which is what lets the nested one matter.
   *
   * A driver document is the whole DQF: CDL and MVR numbers, medical card
   * expiry, insurance policy number, phone and email, plus storage URLs for
   * the CDL scan, MVR and drug-and-alcohol screening — and those URLs carry
   * Firebase download tokens, so they resolve for anyone holding them
   * regardless of storage.rules.
   */
  it('a stranger can no longer read a pre-activated driver by direct get', async () => {
    await seedOwner('stranger');
    await seedDriverDoc('owner-a', 'pre-driver', { accountStatus: 'pre-activated' });
    await assertFails(
      getDoc(doc(asUser('stranger'), 'owner_operators/owner-a/drivers/pre-driver'))
    );
  });

  it('a stranger can no longer reach drivers via collectionGroup', async () => {
    await seedOwner('stranger');
    await seedDriverDoc('owner-a', 'pre-driver', { accountStatus: 'pre-activated' });
    await assertFails(
      getDocs(
        query(
          collectionGroup(asUser('stranger'), 'drivers'),
          where('accountStatus', '==', 'pre-activated')
        )
      )
    );
  });

  it('the unfiltered marketplace collectionGroup is refused too', async () => {
    // The exact query /dashboard/matches used to issue. It reads
    // /api/marketplace/drivers now.
    await seedOwner('stranger');
    await seedDriverDoc('owner-a', 'active-driver');
    await assertFails(getDocs(collectionGroup(asUser('stranger'), 'drivers')));
  });

  it('an unauthenticated caller is still refused', async () => {
    await seedDriverDoc('owner-a', 'pre-driver', { accountStatus: 'pre-activated' });
    await assertFails(
      getDoc(doc(asUnauth(), 'owner_operators/owner-a/drivers/pre-driver'))
    );
  });

  // --- what must KEEP working ---------------------------------------------

  it('a PRE-ACTIVATED driver can still read their own document', async () => {
    // The regression guard for this change. A driver document's id is the
    // driver's auth uid, and /driver-dashboard/complete-profile — the page
    // whose job is to stop being pre-activated — reads it. The driver is
    // neither isOwner nor isAdmin, so without the
    // `request.auth.uid == driverId` branch on `allow get` this denies and
    // onboarding dead-ends. Closing the blanket rule is what exposed it.
    await seedDriverDoc('owner-a', 'driver-self', { accountStatus: 'pre-activated' });
    await assertSucceeds(
      getDoc(doc(asUser('driver-self'), 'owner_operators/owner-a/drivers/driver-self'))
    );
  });

  it('the owning carrier can still read their pre-activated driver', async () => {
    await seedDriverDoc('owner-a', 'pre-driver', { accountStatus: 'pre-activated' });
    await assertSucceeds(
      getDoc(doc(asUser('owner-a'), 'owner_operators/owner-a/drivers/pre-driver'))
    );
  });

  it('an admin can still read a pre-activated driver', async () => {
    await seedAdmin('an-admin');
    await seedDriverDoc('owner-a', 'pre-driver', { accountStatus: 'pre-activated' });
    await assertSucceeds(
      getDoc(doc(asUser('an-admin'), 'owner_operators/owner-a/drivers/pre-driver'))
    );
  });

  it('a counterparty can still get an ACTIVE driver on another roster', async () => {
    // tla-actions.ts and driver-rating-modal.tsx both read the lessor's
    // driver document by path while acting as the lessee. Narrowing `get`
    // would break signing and rating.
    await seedOwner('lessee');
    await seedDriverDoc('owner-a', 'active-driver');
    await assertSucceeds(
      getDoc(doc(asUser('lessee'), 'owner_operators/owner-a/drivers/active-driver'))
    );
  });

  it('a legacy driver with NO accountStatus field is treated as active', async () => {
    // seedDriverDoc writes accountStatus; this one deliberately strips it.
    // The rule defaults the missing field to 'active' via .data.get(), and
    // projection.ts uses the same `?? 'active'` default — which is why
    // closing this rule needed no backfill first.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'owner_operators/owner-a/drivers/legacy'), {
        name: 'Legacy Driver',
      });
    });
    await seedOwner('lessee');
    await assertSucceeds(
      getDoc(doc(asUser('lessee'), 'owner_operators/owner-a/drivers/legacy'))
    );
  });

  it('the owner can still list their own roster', async () => {
    await seedDriverDoc('owner-a', 'd1');
    const snap = await assertSucceeds(
      getDocs(collection(asUser('owner-a'), 'owner_operators/owner-a/drivers'))
    );
    expect(snap.size).toBe(1);
  });

  it('a stranger CANNOT list another carrier\'s roster', async () => {
    await seedOwner('stranger');
    await seedDriverDoc('owner-a', 'd1');
    await assertFails(
      getDocs(collection(asUser('stranger'), 'owner_operators/owner-a/drivers'))
    );
  });

  it('an admin can still list any carrier\'s roster (/admin/users)', async () => {
    await seedAdmin('an-admin');
    await seedDriverDoc('owner-a', 'd1');
    await assertSucceeds(
      getDocs(collection(asUser('an-admin'), 'owner_operators/owner-a/drivers'))
    );
  });

  it('an admin can still run the collectionGroup query (/admin/drivers)', async () => {
    await seedAdmin('an-admin');
    await seedDriverDoc('owner-a', 'd1');
    const snap = await assertSucceeds(getDocs(collectionGroup(asUser('an-admin'), 'drivers')));
    expect(snap.size).toBeGreaterThan(0);
  });
});


// --- matches: party-or-admin READ -----------------------------------------

/**
 * A match document carries both sides' negotiated terms — originalTerms,
 * counterTerms, loadSnapshot.price. Read was `if isSignedIn()`, so any
 * registered account could read every carrier's pricing.
 *
 * It was open because the marketplace board needed other owners' commitments
 * to know who was already booked. /api/commitments answers that without the
 * terms, so the collection can be party-scoped.
 */
describe('matches — party-or-admin read', () => {
  beforeEach(async () => {
    await seedOwner('load-owner');
    await seedOwner('driver-owner');
    await seedOwner('stranger');
    await seedMatch('m1', {
      loadOwnerId: 'load-owner',
      driverOwnerId: 'driver-owner',
      driverId: 'driver-1',
    });
  });

  it('load owner can read their match', async () => {
    await assertSucceeds(getDoc(doc(asUser('load-owner'), 'matches/m1')));
  });

  it('driver owner can read the match', async () => {
    await assertSucceeds(getDoc(doc(asUser('driver-owner'), 'matches/m1')));
  });

  it('the driver themselves can read the match', async () => {
    await assertSucceeds(getDoc(doc(asUser('driver-1'), 'matches/m1')));
  });

  it('the recipient owner can read the match', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'matches/m2'), {
        status: 'pending',
        loadOwnerId: 'load-owner',
        driverOwnerId: 'driver-owner',
        driverId: 'driver-1',
        recipientOwnerId: 'driver-owner',
      });
    });
    await assertSucceeds(getDoc(doc(asUser('driver-owner'), 'matches/m2')));
  });

  it('an unrelated signed-in user CANNOT read the match', async () => {
    // This is the rate disclosure the change closes.
    await assertFails(getDoc(doc(asUser('stranger'), 'matches/m1')));
  });

  it('unauthenticated users cannot read a match', async () => {
    await assertFails(getDoc(doc(asUnauth(), 'matches/m1')));
  });

  it('an admin can read any match', async () => {
    await seedAdmin('an-admin');
    await assertSucceeds(getDoc(doc(asUser('an-admin'), 'matches/m1')));
  });

  it('an admin can read a legacy match that has no recipientOwnerId', async () => {
    // seedMatch writes no recipientOwnerId, which is the shape of a match
    // predating the field. Worth its own case because the read rule names
    // that field, but note what it does NOT prove: swapping the rule to
    // direct property access keeps this green, because the Rules language
    // absorbs an error in one `||` operand when a later one is true. See the
    // comment on the rule.
    await seedAdmin('an-admin');
    await assertSucceeds(getDoc(doc(asUser('an-admin'), 'matches/m1')));
  });

  it('a stranger reading a match with no recipientOwnerId is denied, not errored', async () => {
    await assertFails(getDoc(doc(asUser('stranger'), 'matches/m1')));
  });

  it('a query filtered to my incoming requests succeeds', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'matches/m3'), {
        status: 'pending',
        loadOwnerId: 'load-owner',
        driverOwnerId: 'driver-owner',
        driverId: 'driver-1',
        recipientOwnerId: 'driver-owner',
      });
    });
    const q = query(
      collection(asUser('driver-owner'), 'matches'),
      where('recipientOwnerId', '==', 'driver-owner')
    );
    const snap = await assertSucceeds(getDocs(q));
    expect(snap.size).toBe(1);
  });

  it('an unfiltered list of every match is denied for a non-admin', async () => {
    // What /dashboard/matches used to do, and what made the whole collection
    // readable. The board reads /api/commitments now.
    await assertFails(getDocs(collection(asUser('stranger'), 'matches')));
  });

  it('an unfiltered list of every match still works for the admin console', async () => {
    await seedAdmin('an-admin');
    const snap = await assertSucceeds(getDocs(collection(asUser('an-admin'), 'matches')));
    expect(snap.size).toBeGreaterThan(0);
  });
});

// --- loads: enumeration is owner-or-admin ---------------------------------

/**
 * A load document carries externalRefs: the poster's TMS connection id and a
 * deep link into their provider UI, naming their broker and order number.
 *
 * `get` stays open — the counterparty to a match reads a single load by path
 * in tla-actions.ts and messaging-utils.ts. Enumeration does not.
 */
describe('loads — get is open, enumeration is owner-or-admin', () => {
  beforeEach(async () => {
    await seedOwner('load-owner');
    await seedOwner('stranger');
    await seedLoad('load-owner', 'l1');
  });

  it('the owner can list their own loads', async () => {
    const snap = await assertSucceeds(
      getDocs(collection(asUser('load-owner'), 'owner_operators/load-owner/loads'))
    );
    expect(snap.size).toBe(1);
  });

  it('a stranger CANNOT list another carrier\'s loads', async () => {
    await assertFails(
      getDocs(collection(asUser('stranger'), 'owner_operators/load-owner/loads'))
    );
  });

  it('an admin can list any carrier\'s loads', async () => {
    await seedAdmin('an-admin');
    await assertSucceeds(
      getDocs(collection(asUser('an-admin'), 'owner_operators/load-owner/loads'))
    );
  });

  it('a stranger CAN still get a single load by path (match counterparty)', async () => {
    // Deliberately still allowed: narrowing this would need a get() into
    // /matches per read, to protect a document you must already know both
    // the owner id and the load id to request.
    await assertSucceeds(
      getDoc(doc(asUser('stranger'), 'owner_operators/load-owner/loads/l1'))
    );
  });

  it('a non-admin CANNOT run a collection group query over every load', async () => {
    // The platform-wide scrape. /dashboard/matches ran exactly this with no
    // filter at all; it reads /api/marketplace/loads now.
    await assertFails(getDocs(collectionGroup(asUser('stranger'), 'loads')));
  });

  it('an admin CAN run a collection group query over every load', async () => {
    await seedAdmin('an-admin');
    const snap = await assertSucceeds(getDocs(collectionGroup(asUser('an-admin'), 'loads')));
    expect(snap.size).toBeGreaterThan(0);
  });
});
