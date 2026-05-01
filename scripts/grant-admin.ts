#!/usr/bin/env node
/**
 * Grant XtraFleet admin role to an existing user by email.
 *
 * Looks up the Firebase Auth user by email, then writes
 *   isAdmin: true
 *   adminRole: <role>           (default: 'super_admin')
 * onto owner_operators/{uid}, merging with existing fields. The admin layout
 * (src/app/admin/layout.tsx) reads from owner_operators, so this is the
 * doc that actually gates admin UI access.
 *
 * Usage (from repo root):
 *
 *   firebase use qa
 *   GOOGLE_CLOUD_PROJECT=xtrafleet-qa npx tsx scripts/grant-admin.ts edward@xtrafleet.com
 *
 * Or to grant a non-super role:
 *
 *   npx tsx scripts/grant-admin.ts edward@xtrafleet.com admin
 *   npx tsx scripts/grant-admin.ts edward@xtrafleet.com support
 *   npx tsx scripts/grant-admin.ts edward@xtrafleet.com billing_admin
 *
 * Authentication: uses Application Default Credentials. If you don't have
 * them set up, run once:
 *
 *   gcloud auth application-default login
 *   gcloud config set project xtrafleet-qa
 *
 * Or set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON key path.
 */

import admin from 'firebase-admin';

type AdminRole = 'super_admin' | 'admin' | 'support' | 'billing_admin';
const VALID_ROLES: AdminRole[] = ['super_admin', 'admin', 'support', 'billing_admin'];

async function main() {
  const [, , email, roleArg = 'super_admin'] = process.argv;

  if (!email) {
    console.error('Usage: npx tsx scripts/grant-admin.ts <email> [role]');
    console.error(`  role: one of ${VALID_ROLES.join(', ')} (default: super_admin)`);
    process.exit(1);
  }

  if (!VALID_ROLES.includes(roleArg as AdminRole)) {
    console.error(`Invalid role "${roleArg}". Must be one of: ${VALID_ROLES.join(', ')}`);
    process.exit(1);
  }
  const role = roleArg as AdminRole;

  const projectId =
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.FIREBASE_CONFIG_PROJECT_ID;

  if (!projectId) {
    console.error('No project id detected. Set GOOGLE_CLOUD_PROJECT, e.g.:');
    console.error('  GOOGLE_CLOUD_PROJECT=xtrafleet-qa npx tsx scripts/grant-admin.ts <email>');
    process.exit(1);
  }

  console.log(`📡 Connecting to Firebase project: ${projectId}`);
  admin.initializeApp({ projectId });

  let user: admin.auth.UserRecord;
  try {
    user = await admin.auth().getUserByEmail(email);
  } catch (err) {
    console.error(`❌ No Firebase Auth user found for ${email} in project ${projectId}.`);
    console.error('  Make sure you ran "firebase use qa" (or set GOOGLE_CLOUD_PROJECT) and the user has signed up on QA.');
    if (err instanceof Error) console.error(`  ${err.message}`);
    process.exit(1);
  }

  console.log(`✓ Found auth user: ${user.uid}`);

  const docRef = admin.firestore().collection('owner_operators').doc(user.uid);
  const before = await docRef.get();
  if (!before.exists) {
    console.warn(`⚠ owner_operators/${user.uid} doesn't exist yet — creating with admin fields.`);
    console.warn('  This is unusual; normally the doc is created during signup.');
  }

  await docRef.set(
    {
      isAdmin: true,
      adminRole: role,
      adminGrantedAt: new Date().toISOString(),
      adminGrantedBy: 'scripts/grant-admin.ts',
    },
    { merge: true },
  );

  console.log(`✓ Granted ${role} on owner_operators/${user.uid} (${email}).`);
  console.log('  Refresh the QA dashboard — the admin sidebar should appear.');
  process.exit(0);
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
