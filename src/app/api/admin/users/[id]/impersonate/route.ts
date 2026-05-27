/**
 * Admin: start impersonation of a user (DEV-166).
 *
 * Super-admin only. Mints a Firebase custom token for the target uid and
 * returns it; the client signs in with it to assume the target's identity
 * for support / debugging. Every impersonation start is audit-logged.
 *
 * SECURITY notes:
 * - Hard-gated on adminRole === 'super_admin' (the highest role).
 * - Custom tokens carry a 30-minute expiry by default; the banner client-side
 *   also enforces a 30-minute hard timeout as a defense-in-depth measure.
 * - The audit entry is the only authoritative record — it always runs before
 *   the token is returned.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin, FieldValue } from '@/lib/firebase-admin-singleton';
import { withCors } from '@/lib/api-cors';
import type { AdminRole } from '@/lib/admin-roles';

const IMPERSONATION_TTL_MS = 30 * 60 * 1000; // 30 minutes

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status });
}

async function handlePost(request: NextRequest, targetUid: string) {
  try {
    if (!targetUid) return json({ error: 'A user id is required.' }, 400);

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

    // 2. Authorize — super_admin only.
    const adminSnap = await db.collection('owner_operators').doc(adminUid).get();
    const adminData = adminSnap.exists ? adminSnap.data() : null;
    const role = (adminData?.adminRole as AdminRole) || undefined;
    if (!adminData?.isAdmin || role !== 'super_admin') {
      return json({ error: 'Super admin access required for impersonation.' }, 403);
    }
    if (adminUid === targetUid) {
      return json({ error: 'You cannot impersonate yourself.' }, 400);
    }

    // 3. Confirm the target exists.
    const targetSnap = await db.collection('owner_operators').doc(targetUid).get();
    if (!targetSnap.exists) {
      return json({ error: 'Target user not found.' }, 404);
    }
    const targetData = targetSnap.data() as {
      contactEmail?: string;
      companyName?: string;
      legalName?: string;
      isAdmin?: boolean;
    };
    if (targetData.isAdmin) {
      return json({ error: 'Refusing to impersonate another admin.' }, 403);
    }

    // 4. Audit the start BEFORE handing back the token. If this throws, the
    //    impersonation simply doesn't begin.
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + IMPERSONATION_TTL_MS).toISOString();
    await db.collection('audit_logs').add({
      action: 'impersonation_started',
      adminId: adminUid,
      adminEmail,
      targetType: 'user',
      targetId: targetUid,
      targetName: targetData.companyName || targetData.legalName || targetData.contactEmail || targetUid,
      details: { expiresAt },
      timestamp: FieldValue.serverTimestamp(),
      createdAt: now,
    });

    // 5. Mint the custom token. Custom claims travel with the impersonated
    //    session so server endpoints can detect / log impersonation.
    let customToken: string;
    try {
      customToken = await auth.createCustomToken(targetUid, {
        impersonatedBy: adminUid,
        impersonationExpiresAt: expiresAt,
      });
    } catch (err: any) {
      console.error('[impersonate] createCustomToken failed', err);
      return json(
        {
          error:
            'Could not mint an impersonation token. createCustomToken requires a real service-account credential; emulator-mode environments cannot impersonate.',
        },
        500
      );
    }

    return json(
      {
        success: true,
        customToken,
        target: {
          uid: targetUid,
          email: targetData.contactEmail || '',
          companyName: targetData.companyName || targetData.legalName || '',
        },
        admin: { uid: adminUid, email: adminEmail },
        expiresAt,
      },
      200
    );
  } catch (error: any) {
    console.error('[POST /api/admin/users/[id]/impersonate]', error);
    return json({ error: error?.message || 'Failed to start impersonation.' }, 500);
  }
}

export const POST = withCors((req: NextRequest) => {
  // /api/admin/users/[id]/impersonate
  const parts = req.nextUrl.pathname.split('/');
  const id = parts[parts.length - 2];
  return handlePost(req, id);
});
