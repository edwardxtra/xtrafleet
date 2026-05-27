/**
 * Admin: list all conversations across the platform (DEV-165).
 *
 * Permission: `audit:view` (support, admin, super_admin).
 * Server-mediated so this admin path doesn't require relaxing the
 * conversations Firestore rules (which scope reads to participants).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase-admin-singleton';
import { withCors } from '@/lib/api-cors';
import { hasPermission, getDefaultRoleForLegacyAdmin, type AdminRole } from '@/lib/admin-roles';

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status });
}

async function handleGet(request: NextRequest) {
  try {
    const { auth, db } = await getFirebaseAdmin();

    const tokenCookie = request.cookies.get('fb-id-token');
    if (!tokenCookie) return json({ error: 'You must be signed in.' }, 401);
    let decoded: { uid: string; email?: string };
    try {
      try {
        decoded = await auth.verifySessionCookie(tokenCookie.value, true);
      } catch {
        decoded = await auth.verifyIdToken(tokenCookie.value);
      }
    } catch {
      return json({ error: 'Your session is invalid. Please sign in again.' }, 401);
    }
    const adminUid = decoded.uid;

    const adminSnap = await db.collection('owner_operators').doc(adminUid).get();
    const adminData = adminSnap.exists ? adminSnap.data() : null;
    if (!adminData?.isAdmin) {
      return json({ error: 'Admin access required.' }, 403);
    }
    const role: AdminRole = (adminData.adminRole as AdminRole) || getDefaultRoleForLegacyAdmin();
    if (!hasPermission(role, 'audit:view')) {
      return json({ error: 'You do not have permission to view conversations.' }, 403);
    }

    // Newest activity first.
    const snap = await db.collection('conversations').orderBy('lastMessageAt', 'desc').limit(200).get();
    const conversations = snap.docs.map((d: FirebaseFirestore.QueryDocumentSnapshot) => ({ id: d.id, ...d.data() }));
    return json({ conversations }, 200);
  } catch (error: any) {
    console.error('[GET /api/admin/conversations]', error);
    return json({ error: 'Failed to load conversations.' }, 500);
  }
}

export const GET = withCors(handleGet);
