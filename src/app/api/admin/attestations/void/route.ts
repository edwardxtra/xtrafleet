/**
 * Admin: void an attestation entry (DEV-165).
 *
 * Append-only by design — the original entry stays in
 * `owner_operators/{uid}.attestations[]` for audit integrity. A parallel
 * `attestationVoids[]` entry is added to mark the original as no longer valid.
 *
 * Permission: `users:edit` (admins who can edit users can void their attestations).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin, FieldValue } from '@/lib/firebase-admin-singleton';
import { withCors } from '@/lib/api-cors';
import { hasPermission, getDefaultRoleForLegacyAdmin, type AdminRole } from '@/lib/admin-roles';

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status });
}

async function handlePost(request: NextRequest) {
  try {
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
      return json({ error: 'You do not have permission to void attestations.' }, 403);
    }

    // 3. Validate input.
    let body: { ownerUid?: string; type?: string; entryAcceptedAt?: string; reason?: string };
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid request body.' }, 400);
    }
    const { ownerUid, type, entryAcceptedAt, reason } = body;
    if (!ownerUid || !type || !entryAcceptedAt || !reason || !reason.trim()) {
      return json({ error: 'ownerUid, type, entryAcceptedAt, and reason are required.' }, 400);
    }

    // 4. Confirm the attestation entry exists on the owner doc (and isn't already voided).
    const ownerRef = db.collection('owner_operators').doc(ownerUid);
    const ownerSnap = await ownerRef.get();
    if (!ownerSnap.exists) {
      return json({ error: 'Owner not found.' }, 404);
    }
    const ownerData = ownerSnap.data() as {
      attestations?: { type: string; acceptedAt: string }[];
      attestationVoids?: { type: string; entryAcceptedAt: string }[];
    };
    const matches = (ownerData.attestations || []).some(
      (a) => a.type === type && a.acceptedAt === entryAcceptedAt
    );
    if (!matches) {
      return json({ error: 'No matching attestation found for this owner.' }, 404);
    }
    const alreadyVoided = (ownerData.attestationVoids || []).some(
      (v) => v.type === type && v.entryAcceptedAt === entryAcceptedAt
    );
    if (alreadyVoided) {
      return json({ error: 'This attestation is already voided.' }, 409);
    }

    // 5. Append the void entry — original attestation stays put for audit.
    const now = new Date().toISOString();
    const voidEntry = {
      type,
      entryAcceptedAt,
      voidedAt: now,
      voidedBy: adminUid,
      voidedReason: reason.trim(),
    };
    await ownerRef.update({
      attestationVoids: FieldValue.arrayUnion(voidEntry),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 6. Audit.
    await db.collection('audit_logs').add({
      action: 'attestation_voided',
      adminId: adminUid,
      adminEmail,
      targetType: 'user',
      targetId: ownerUid,
      reason: reason.trim(),
      details: { attestationType: type, entryAcceptedAt },
      timestamp: FieldValue.serverTimestamp(),
      createdAt: now,
    });

    return json({ success: true, voidEntry }, 200);
  } catch (error: any) {
    console.error('[POST /api/admin/attestations/void]', error);
    return json({ error: error?.message || 'Failed to void attestation.' }, 500);
  }
}

export const POST = withCors(handlePost);
