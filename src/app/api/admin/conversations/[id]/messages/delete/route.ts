/**
 * Admin: soft-delete a message in a conversation (DEV-165).
 *
 * Soft delete — the message doc stays, but gets `deletedAt`, `deletedBy`,
 * and `deletedReason` set; the original text is preserved in `originalText`
 * if not already so. The conversations Firestore rules are unchanged
 * (participants only); admins go through this server route, which uses the
 * Admin SDK and bypasses rules.
 *
 * Permission: `users:edit` (more sensitive than just viewing).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin, FieldValue } from '@/lib/firebase-admin-singleton';
import { withCors } from '@/lib/api-cors';
import { hasPermission, getDefaultRoleForLegacyAdmin, type AdminRole } from '@/lib/admin-roles';

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status });
}

async function handlePost(request: NextRequest, conversationId: string) {
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
    const adminEmail = decoded.email || '';

    const adminSnap = await db.collection('owner_operators').doc(adminUid).get();
    const adminData = adminSnap.exists ? adminSnap.data() : null;
    if (!adminData?.isAdmin) {
      return json({ error: 'Admin access required.' }, 403);
    }
    const role: AdminRole = (adminData.adminRole as AdminRole) || getDefaultRoleForLegacyAdmin();
    if (!hasPermission(role, 'users:edit')) {
      return json({ error: 'You do not have permission to delete messages.' }, 403);
    }

    let body: { messageId?: string; reason?: string };
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid request body.' }, 400);
    }
    const { messageId, reason } = body;
    if (!messageId) return json({ error: 'messageId is required.' }, 400);

    const messageRef = db
      .collection('conversations')
      .doc(conversationId)
      .collection('messages')
      .doc(messageId);
    const messageSnap = await messageRef.get();
    if (!messageSnap.exists) {
      return json({ error: 'Message not found.' }, 404);
    }
    const messageData = messageSnap.data() as { text?: string; originalText?: string; deletedAt?: string };
    if (messageData.deletedAt) {
      return json({ error: 'This message is already deleted.' }, 409);
    }

    const now = new Date().toISOString();
    // Preserve the original text the first time we delete (idempotent).
    const update: Record<string, unknown> = {
      deletedAt: now,
      deletedBy: adminUid,
      deletedReason: (reason || '').trim(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (!messageData.originalText && messageData.text) {
      update.originalText = messageData.text;
    }
    update.text = '[Message removed by admin]';
    await messageRef.update(update);

    await db.collection('audit_logs').add({
      action: 'message_deleted',
      adminId: adminUid,
      adminEmail,
      targetType: 'system',
      targetId: `conversations/${conversationId}/messages/${messageId}`,
      reason: (reason || '').trim(),
      details: { conversationId, messageId },
      timestamp: FieldValue.serverTimestamp(),
      createdAt: now,
    });

    return json({ success: true }, 200);
  } catch (error: any) {
    console.error('[POST /api/admin/conversations/:id/messages/delete]', error);
    return json({ error: 'Failed to delete message.' }, 500);
  }
}

export const POST = withCors((req: NextRequest) => {
  // /api/admin/conversations/[id]/messages/delete
  const parts = req.nextUrl.pathname.split('/');
  const id = parts[4];
  return handlePost(req, id);
});
