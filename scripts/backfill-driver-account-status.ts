#!/usr/bin/env node
/**
 * Backfill `accountStatus: 'active'` onto driver documents that have no
 * accountStatus field at all.
 *
 * WHY THIS IS SAFE, AND WHY IT IS NOT URGENT
 *
 * A legacy driver document predates DEV-158 and carries no accountStatus.
 * Two places decide what that means, and they already agree:
 *
 *   firestore.rules   resource.data.get('accountStatus', 'active')
 *   projection.ts     (raw.accountStatus ?? 'active')
 *
 * Both read a missing field as 'active'. So writing 'active' onto exactly
 * those documents is behaviour-preserving by construction — it cannot change
 * a rules decision or a marketplace eligibility decision, because both
 * already behave as if the value were there. That is the whole safety
 * argument, and it is why this script refuses to touch a document that
 * already has the field: overwriting an existing value is a different and
 * much riskier operation, and not one this script is for.
 *
 * It was once a prerequisite for closing the drivers read rule, on the
 * grounds that a Firestore query cannot match a missing field. That turned
 * out to apply only to filtering in a QUERY; the projection filters in
 * application code, so the rule closed without it. What is left is data
 * hygiene: an explicit field is greppable, shows up in the console, and
 * removes a default that two files have to keep agreeing on.
 *
 * USAGE — dry run first, always. Dry run is the default; nothing is written
 * without --apply.
 *
 *   firebase use qa
 *   GOOGLE_CLOUD_PROJECT=xtrafleet-qa npx tsx scripts/backfill-driver-account-status.ts
 *   GOOGLE_CLOUD_PROJECT=xtrafleet-qa npx tsx scripts/backfill-driver-account-status.ts --apply
 *
 * Then, only after verifying QA:
 *
 *   GOOGLE_CLOUD_PROJECT=studio-5112915880-e9ca2 npx tsx scripts/backfill-driver-account-status.ts
 *   GOOGLE_CLOUD_PROJECT=studio-5112915880-e9ca2 npx tsx scripts/backfill-driver-account-status.ts --apply
 *
 * Authentication: Application Default Credentials, same as grant-admin.ts.
 *
 *   gcloud auth application-default login
 */

import admin from 'firebase-admin';

/** Firestore's hard limit is 500 writes per batch. */
const BATCH_LIMIT = 400;

async function main() {
  const apply = process.argv.includes('--apply');
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;

  if (!projectId) {
    console.error('Refusing to run without GOOGLE_CLOUD_PROJECT set.');
    console.error('Naming the project explicitly is the guard against');
    console.error('backfilling production when you meant QA.');
    process.exit(1);
  }

  admin.initializeApp({ projectId });
  const db = admin.firestore();

  console.log(`project:  ${projectId}`);
  console.log(`mode:     ${apply ? 'APPLY — will write' : 'dry run — no writes'}`);
  console.log('');

  // Read every driver. There is no query for "field is absent", which is the
  // same limitation that made this look like a blocker for the rules change;
  // the filtering happens here in application code instead.
  const snap = await db.collectionGroup('drivers').get();

  const missing: Array<{ path: string; name: string }> = [];
  const present = new Map<string, number>();

  snap.forEach((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    if (!('accountStatus' in data)) {
      missing.push({
        path: docSnap.ref.path,
        name: typeof data.name === 'string' ? data.name : '(no name)',
      });
    } else {
      const value = String(data.accountStatus);
      present.set(value, (present.get(value) ?? 0) + 1);
    }
  });

  console.log(`drivers scanned:            ${snap.size}`);
  console.log(`already have accountStatus: ${snap.size - missing.length}`);
  for (const [value, count] of [...present.entries()].sort()) {
    console.log(`    ${value}: ${count}`);
  }
  console.log(`missing accountStatus:      ${missing.length}`);
  console.log('');

  if (missing.length === 0) {
    console.log('Nothing to backfill.');
    return;
  }

  const sample = missing.slice(0, 10);
  console.log(`would set accountStatus='active' on ${missing.length} document(s):`);
  for (const row of sample) console.log(`    ${row.path}  (${row.name})`);
  if (missing.length > sample.length) {
    console.log(`    ... and ${missing.length - sample.length} more`);
  }
  console.log('');

  if (!apply) {
    console.log('Dry run — nothing written. Re-run with --apply to write.');
    return;
  }

  let written = 0;
  for (let i = 0; i < missing.length; i += BATCH_LIMIT) {
    const chunk = missing.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    for (const row of chunk) {
      // merge-style update: sets only this field, leaves the rest alone.
      batch.update(db.doc(row.path), { accountStatus: 'active' });
    }
    await batch.commit();
    written += chunk.length;
    console.log(`committed ${written}/${missing.length}`);
  }

  console.log('');
  console.log(`Done. ${written} document(s) updated.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
