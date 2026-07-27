/**
 * Admin: send a password-reset link to a user (DEV-166).
 *
 * Uses the Firebase Admin SDK's generatePasswordResetLink, then routes the
 * email through Resend (our own template) instead of Firebase's default
 * sender. Admin-gated on `users:edit`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin, FieldValue } from '@/lib/firebase-admin-singleton';
import { withCors } from '@/lib/api-cors';
import { hasPermission, getDefaultRoleForLegacyAdmin, type AdminRole } from '@/lib/admin-roles';
import { sendPasswordResetEmail } from '@/lib/email';

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status });
}

async function handlePost(request: NextRequest, ownerOperatorId: string) {
  try {
    if (!ownerOperatorId) return json({ error: 'A user id is required.' }, 400);

    const { auth, db } = await getFirebaseAdmin();

    // 1. Authenticate.
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

    // 2. Authorize.
    const adminSnap = await db.collection('owner_operators').doc(adminUid).get();
    const adminData = adminSnap.exists ? adminSnap.data() : null;
    if (!adminData?.isAdmin) {
      return json({ error: 'Admin access required.' }, 403);
    }
    const role: AdminRole = (adminData.adminRole as AdminRole) || getDefaultRoleForLegacyAdmin();
    if (!hasPermission(role, 'users:edit')) {
      return json({ error: 'You do not have permission to send password resets.' }, 403);
    }

    // 3. Load the target.
    const ooSnap = await db.collection('owner_operators').doc(ownerOperatorId).get();
    if (!ooSnap.exists) {
      return json({ error: 'User not found.' }, 404);
    }
    const oo = ooSnap.data() as {
      contactEmail?: string;
      contactName?: string;
      companyName?: string;
      accountStatus?: string;
    };
    if (!oo.contactEmail) {
      return json({ error: 'This account has no contact email on file.' }, 422);
    }
    if (oo.accountStatus === 'pre-activated') {
      return json(
        { error: 'This account is pre-activated and has no password yet. Use Send Activation Email instead.' },
        409
      );
    }

    // 4. Mint the reset link (Firebase Auth).
    let resetLink: string;
    try {
      resetLink = await auth.generatePasswordResetLink(oo.contactEmail);
    } catch (err: unknown) {
      const code =
        (err as { code?: string })?.code ||
        (err as { errorInfo?: { code?: string } })?.errorInfo?.code ||
        '';
      if (code === 'auth/user-not-found') {
        return json({ error: 'No Firebase Auth user exists for this account.' }, 404);
      }
      throw err;
    }

    // 5. Send via Resend (our template, not Firebase's default).
    const recipientName = oo.contactName || oo.companyName || 'there';
    const sendResult = await sendPasswordResetEmail(oo.contactEmail, recipientName, resetLink);

    // 6. Audit.
    const now = new Date().toISOString();
    await db.collection('audit_logs').add({
      action: 'password_reset_sent',
      adminId: adminUid,
      adminEmail,
      targetType: 'user',
      targetId: ownerOperatorId,
      details: { email: oo.contactEmail, emailDelivered: sendResult.success },
      timestamp: FieldValue.serverTimestamp(),
      createdAt: now,
    });

    return json({ success: true, emailDelivered: sendResult.success }, 200);
  } catch (error: any) {
    console.error('[POST /api/admin/users/[id]/password-reset]', error);
    return json({ error: error?.message || 'Failed to send password reset.' }, 500);
  }
}

export const POST = withCors((req: NextRequest) => {
  // /api/admin/users/[id]/password-reset
  const parts = req.nextUrl.pathname.split('/');
  const id = parts[parts.length - 2];
  return handlePost(req, id);
});
