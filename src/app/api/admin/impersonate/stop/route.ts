/**
 * Audit-log the end of an impersonation session (DEV-166).
 *
 * Called by the impersonation banner's Stop button. The banner fires this
 * BEFORE it signs the client out, so the caller is still authenticated — as
 * the impersonated target, whose token carries the `impersonatedBy` custom
 * claim minted by the start route.
 *
 * SECURITY: this route used to require no auth at all, on the reasoning that
 * "the user is no longer authenticated as the admin when this fires". That is
 * true of the ADMIN but missed that the caller is authenticated as the TARGET.
 * The cost of the gap was that anyone, unauthenticated, could POST arbitrary
 * `impersonation_ended` entries into `audit_logs` naming any admin and any
 * target — forging a record, or spraying entries to bury a real one, in the
 * exact log you would consult during an incident.
 *
 * Both identities now come from the verified token, never from the body:
 * - targetUid  = the uid the caller is signed in as
 * - adminUid   = the `impersonatedBy` claim, which only the start route can mint
 *
 * The body contributes only `reason`, which is bounded free text.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin, FieldValue } from '@/lib/firebase-admin-singleton';
import { withCors } from '@/lib/api-cors';

/** `reason` is operator-supplied free text headed for the audit log. */
const MAX_REASON_CHARS = 200;

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status });
}

async function handlePost(request: NextRequest) {
  try {
    const { auth, db } = await getFirebaseAdmin();

    // 1. Authenticate. The impersonated session is still live at this point.
    const tokenCookie = request.cookies.get('fb-id-token');
    if (!tokenCookie) return json({ error: 'You must be signed in.' }, 401);
    let decoded: { uid: string; impersonatedBy?: unknown };
    try {
      try {
        decoded = await auth.verifySessionCookie(tokenCookie.value, true);
      } catch {
        decoded = await auth.verifyIdToken(tokenCookie.value);
      }
    } catch {
      return json({ error: 'Your session is invalid. Please sign in again.' }, 401);
    }

    // 2. The session must actually BE an impersonation. `impersonatedBy` is a
    //    custom claim; only the start route (super_admin gated) can set it, so
    //    an ordinary signed-in user cannot reach this.
    const adminUid = typeof decoded.impersonatedBy === 'string' ? decoded.impersonatedBy : '';
    if (!adminUid) {
      return json({ error: 'This session is not an impersonation.' }, 403);
    }
    const targetUid = decoded.uid;

    // 3. Resolve the admin's email from the record rather than the request.
    let adminEmail = '';
    try {
      const adminSnap = await db.collection('owner_operators').doc(adminUid).get();
      adminEmail = (adminSnap.data()?.contactEmail as string) || '';
    } catch {
      /* The entry is still worth writing without it. */
    }

    // 4. `reason` is the only field the caller still controls.
    let reason = 'Stopped via banner';
    try {
      const body = (await request.json()) as { reason?: unknown };
      if (typeof body?.reason === 'string' && body.reason.trim()) {
        reason = body.reason.trim().slice(0, MAX_REASON_CHARS);
      }
    } catch {
      /* No body, or unparseable — the default reason stands. */
    }

    const now = new Date().toISOString();
    await db.collection('audit_logs').add({
      action: 'impersonation_ended',
      adminId: adminUid,
      adminEmail,
      targetType: 'user',
      targetId: targetUid,
      reason,
      timestamp: FieldValue.serverTimestamp(),
      createdAt: now,
    });

    return json({ success: true }, 200);
  } catch (error: any) {
    console.error('[POST /api/admin/impersonate/stop]', error);
    // A write failure must not strand the user mid-sign-out. Auth failures
    // above return real 401/403; only unexpected errors land here.
    return json({ success: false, error: 'Could not record impersonation end (continuing).' }, 200);
  }
}

export const POST = withCors(handlePost);
