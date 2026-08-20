/**
 * Shared admin authentication for /api/admin/* route handlers.
 *
 * Every admin route repeats the same three steps: read the `fb-id-token`
 * cookie, verify it (session cookie first, ID token as a fallback), then load
 * the caller's owner_operators doc to confirm `isAdmin` and resolve their
 * role. This centralises that so a route only has to state which permission
 * it needs.
 *
 * Note the trust model: admin status lives on the caller's owner_operators
 * document. `firestore.rules` prevents the holder from writing the `isAdmin`
 * and `adminRole` fields themselves — only a super_admin or the Admin SDK
 * can — so reading them here is safe.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from './firebase-admin-singleton';
import { getDefaultRoleForLegacyAdmin, type AdminRole } from './admin-roles';

// Derive the SDK handle types from the singleton rather than importing them,
// so this stays correct whichever firebase-admin surface it returns.
type FirebaseAdmin = Awaited<ReturnType<typeof getFirebaseAdmin>>;

export type AdminContext =
  | {
      ok: true;
      auth: FirebaseAdmin['auth'];
      db: FirebaseAdmin['db'];
      adminUid: string;
      adminEmail: string;
      role: AdminRole;
    }
  | { ok: false; response: NextResponse };

function fail(message: string, status: number): AdminContext {
  return { ok: false, response: NextResponse.json({ error: message }, { status }) };
}

export async function requireAdminContext(request: NextRequest): Promise<AdminContext> {
  const { auth, db } = await getFirebaseAdmin();

  const tokenCookie = request.cookies.get('fb-id-token');
  if (!tokenCookie) return fail('You must be signed in.', 401);

  let decoded: { uid: string; email?: string };
  try {
    try {
      decoded = await auth.verifySessionCookie(tokenCookie.value, true);
    } catch {
      decoded = await auth.verifyIdToken(tokenCookie.value);
    }
  } catch {
    return fail('Your session is invalid. Please sign in again.', 401);
  }

  const adminSnap = await db.collection('owner_operators').doc(decoded.uid).get();
  const adminData = adminSnap.exists ? adminSnap.data() : null;
  if (!adminData?.isAdmin) return fail('Admin access required.', 403);

  return {
    ok: true,
    auth,
    db,
    adminUid: decoded.uid,
    adminEmail: decoded.email || '',
    role: (adminData.adminRole as AdminRole) || getDefaultRoleForLegacyAdmin(),
  };
}
