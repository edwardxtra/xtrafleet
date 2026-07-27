/**
 * Audit-log the end of an impersonation session (DEV-166).
 *
 * Called by the impersonation banner's Stop button after the client has
 * already signed out the impersonated session. The body carries the
 * adminUid / targetUid the banner remembered client-side; the entry is
 * "best-effort" — the user is no longer authenticated as the admin when
 * this fires, so we don't require auth on this route.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin, FieldValue } from '@/lib/firebase-admin-singleton';
import { withCors } from '@/lib/api-cors';

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status });
}

async function handlePost(request: NextRequest) {
  try {
    let body: { adminUid?: string; adminEmail?: string; targetUid?: string; reason?: string };
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid request body.' }, 400);
    }
    const { adminUid, adminEmail, targetUid, reason } = body;
    if (!adminUid || !targetUid) {
      return json({ error: 'adminUid and targetUid are required.' }, 400);
    }

    const { db } = await getFirebaseAdmin();
    const now = new Date().toISOString();
    await db.collection('audit_logs').add({
      action: 'impersonation_ended',
      adminId: adminUid,
      adminEmail: adminEmail || '',
      targetType: 'user',
      targetId: targetUid,
      reason: reason || 'Stopped via banner',
      timestamp: FieldValue.serverTimestamp(),
      createdAt: now,
    });

    return json({ success: true }, 200);
  } catch (error: any) {
    console.error('[POST /api/admin/impersonate/stop]', error);
    // Even if logging fails, don't block the user from continuing.
    return json({ success: false, error: 'Could not record impersonation end (continuing).' }, 200);
  }
}

export const POST = withCors(handlePost);
