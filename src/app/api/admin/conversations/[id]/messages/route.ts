/**
 * Admin: list messages in a conversation (DEV-165).
 *
 * Includes soft-deleted messages (with deletedAt / deletedBy / deletedReason
 * intact) so the audit trail is complete.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase-admin-singleton';
import { withCors } from '@/lib/api-cors';
import { hasPermission, getDefaultRoleForLegacyAdmin, type AdminRole } from '@/lib/admin-roles';

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status });
}

async function handleGet(request: NextRequest, conversationId: string) {
  try {
    if (!conversationId) return json({ error: 'A conversation id is required.' }, 400);

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

    const convSnap = await db.collection('conversations').doc(conversationId).get();
    if (!convSnap.exists) {
      return json({ error: 'Conversation not found.' }, 404);
    }
    const conversation = { id: convSnap.id, ...convSnap.data() };

    const messagesSnap = await db
      .collection('conversations')
      .doc(conversationId)
      .collection('messages')
      .orderBy('createdAt', 'asc')
      .limit(500)
      .get();
    const messages = messagesSnap.docs.map((d: FirebaseFirestore.QueryDocumentSnapshot) => ({ id: d.id, ...d.data() }));
    return json({ conversation, messages }, 200);
  } catch (error: any) {
    console.error('[GET /api/admin/conversations/:id/messages]', error);
    return json({ error: 'Failed to load messages.' }, 500);
  }
}

export const GET = withCors((req: NextRequest) => {
  // /api/admin/conversations/[id]/messages
  const parts = req.nextUrl.pathname.split('/');
  const id = parts[4];
  return handleGet(req, id);
});
