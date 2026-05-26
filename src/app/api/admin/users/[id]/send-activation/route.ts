/**
 * Admin: (re)send activation email for a pre-activated account (DEV-164).
 *
 * Activation tokens are stored hashed — we can never reconstruct the raw
 * token from Firestore. "Resend" therefore always **mints a fresh token**,
 * marks any prior unconsumed tokens for this account as superseded, and
 * emails the new link.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase-admin-singleton';
import { withCors } from '@/lib/api-cors';
import { hasPermission, getDefaultRoleForLegacyAdmin, type AdminRole } from '@/lib/admin-roles';
import {
  generateActivationToken,
  hashActivationToken,
  ACTIVATION_TOKEN_TTL_DAYS,
} from '@/lib/activation-tokens';
import { sendActivationEmail } from '@/lib/email';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://xtrafleet.com';

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status });
}

async function handlePost(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const ownerOperatorId = context.params.id;
    if (!ownerOperatorId) {
      return json({ error: 'A user id is required.' }, 400);
    }

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

    // 2. Authorize — same permission as pre-registration.
    const adminSnap = await db.collection('owner_operators').doc(adminUid).get();
    const adminData = adminSnap.exists ? adminSnap.data() : null;
    if (!adminData?.isAdmin) {
      return json({ error: 'Admin access required.' }, 403);
    }
    const role: AdminRole =
      (adminData.adminRole as AdminRole) || getDefaultRoleForLegacyAdmin();
    if (!hasPermission(role, 'users:create')) {
      return json({ error: 'You do not have permission to send activation links.' }, 403);
    }

    // 3. Load the target — must exist and still be pre-activated.
    const ooRef = db.collection('owner_operators').doc(ownerOperatorId);
    const ooSnap = await ooRef.get();
    if (!ooSnap.exists) {
      return json({ error: 'User not found.' }, 404);
    }
    const oo = ooSnap.data() as {
      accountStatus?: string;
      contactEmail?: string;
      contactName?: string;
      companyName?: string;
    };
    if (oo.accountStatus !== 'pre-activated') {
      return json(
        { error: 'This account is not pre-activated — no activation link is needed.' },
        409
      );
    }
    if (!oo.contactEmail) {
      return json({ error: 'This account has no contact email on file.' }, 422);
    }

    const now = new Date().toISOString();

    // 4. Invalidate any existing unconsumed tokens for this account, so the
    //    previously-emailed link stops working.
    const existing = await db
      .collection('activation_tokens')
      .where('ownerOperatorId', '==', ownerOperatorId)
      .get();
    const supersedeBatch = db.batch();
    let supersededCount = 0;
    for (const docSnap of existing.docs) {
      const data = docSnap.data() as { consumedAt?: string };
      if (data.consumedAt) continue;
      supersedeBatch.update(docSnap.ref, { consumedAt: now, supersededBy: 'resend' });
      supersededCount += 1;
    }
    if (supersededCount > 0) await supersedeBatch.commit();

    // 5. Mint the new token.
    const rawToken = generateActivationToken();
    const expiresAt = new Date(
      Date.now() + ACTIVATION_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();
    await db
      .collection('activation_tokens')
      .doc(hashActivationToken(rawToken))
      .set({
        ownerOperatorId,
        email: oo.contactEmail,
        companyName: oo.companyName || '',
        recipientName: oo.contactName || oo.companyName || '',
        createdByAdmin: adminUid,
        createdAt: now,
        expiresAt,
      });

    const activationUrl = `${APP_URL}/activate?token=${rawToken}`;

    // 6. Email it (best-effort — admin still gets the link in the response).
    sendActivationEmail(
      oo.contactEmail,
      oo.contactName || oo.companyName || 'there',
      activationUrl
    ).catch((err) =>
      console.error('[admin/users/send-activation] email failed', err)
    );

    // 7. Audit.
    await db.collection('admin_audit').add({
      action: 'user_activation_resent',
      adminId: adminUid,
      adminEmail,
      targetType: 'user',
      targetId: ownerOperatorId,
      details: {
        email: oo.contactEmail,
        supersededTokens: supersededCount,
      },
      timestamp: now,
    });

    return json(
      {
        success: true,
        activationUrl,
        expiresAt,
        supersededTokens: supersededCount,
      },
      200
    );
  } catch (error) {
    console.error('[POST /api/admin/users/[id]/send-activation]', error);
    return json(
      { error: 'An unexpected error occurred while sending the activation email.' },
      500
    );
  }
}

export const POST = withCors((req: NextRequest) => {
  // withCors loses the dynamic-route params; pull them off the URL path.
  const parts = req.nextUrl.pathname.split('/');
  const id = parts[parts.length - 2]; // /api/admin/users/[id]/send-activation
  return handlePost(req, { params: { id } });
});
