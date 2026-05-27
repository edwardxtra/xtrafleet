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
