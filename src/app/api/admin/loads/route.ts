/**
 * Admin: post a load on behalf of an owner-operator (DEV-170).
 *
 * Companion to /api/admin/drivers. Lets the white-glove team populate
 * a pre-registered or active fleet's marketplace presence before that
 * fleet ever signs in, so a real compliance-verified match can be
 * formed on their behalf.
 *
 * Gating: `loads:edit` permission (same as the edit flow).
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getFirebaseAdmin, FieldValue } from '@/lib/firebase-admin-singleton';
import { withCors } from '@/lib/api-cors';
import { hasPermission, getDefaultRoleForLegacyAdmin, type AdminRole } from '@/lib/admin-roles';

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status });
}

const bodySchema = z.object({
  ownerOperatorId: z.string().trim().min(1, 'ownerOperatorId is required'),
  origin: z.string().trim().min(1, 'Origin is required'),
  destination: z.string().trim().min(1, 'Destination is required'),
  cargo: z.string().trim().optional(),
  loadType: z.string().trim().optional(),
  weight: z.coerce.number().nonnegative().optional(),
  status: z.string().trim().optional(),
  requiredQualifications: z.array(z.string()).optional(),
  trailerType: z.string().trim().optional(),
  description: z.string().trim().optional(),
  price: z.coerce.number().nonnegative().optional(),
  driverCompensation: z.coerce.number().nonnegative().optional(),
  pickupDate: z.string().trim().optional(),
});

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

    // 2. Authorize — loads:edit.
    const adminSnap = await db.collection('owner_operators').doc(adminUid).get();
    const adminData = adminSnap.exists ? adminSnap.data() : null;
    if (!adminData?.isAdmin) {
      return json({ error: 'Admin access required.' }, 403);
    }
    const role: AdminRole = (adminData.adminRole as AdminRole) || getDefaultRoleForLegacyAdmin();
    if (!hasPermission(role, 'loads:edit')) {
      return json({ error: 'You do not have permission to post loads.' }, 403);
    }

    // 3. Validate input.
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return json({ error: 'Invalid request body.' }, 400);
    }
    const parsed = bodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return json(
        {
          error:
            Object.values(parsed.error.flatten().fieldErrors).flat().join(', ') ||
            'Invalid input.',
        },
        400
      );
    }
    const input = parsed.data;

    // 4. Confirm the target owner-operator exists.
    const ownerSnap = await db.collection('owner_operators').doc(input.ownerOperatorId).get();
    if (!ownerSnap.exists) {
      return json({ error: 'Target owner-operator not found.' }, 404);
    }
    const ownerData = ownerSnap.data() as { legalName?: string; companyName?: string };

    // 5. Create the load.
    const loadRef = db
      .collection('owner_operators')
      .doc(input.ownerOperatorId)
      .collection('loads')
      .doc();
    const loadId = loadRef.id;
    const now = new Date().toISOString();

    const { ownerOperatorId, ...rest } = input;
    const loadDoc: Record<string, unknown> = {
      id: loadId,
      ...rest,
      status: input.status || 'Pending',
      requiredQualifications: input.requiredQualifications ?? [],
      createdByAdmin: adminUid,
      createdAt: now,
      updatedAt: FieldValue.serverTimestamp(),
    };

    await loadRef.set(loadDoc);

    // 6. Audit.
    await db.collection('audit_logs').add({
      action: 'load_created_by_admin',
      adminId: adminUid,
      adminEmail,
      targetType: 'load',
      targetId: loadId,
      targetName: `${input.origin} → ${input.destination}`,
      details: {
        ownerOperatorId,
        ownerName: ownerData.companyName || ownerData.legalName || '',
      },
      timestamp: FieldValue.serverTimestamp(),
      createdAt: now,
    });

    return json({ success: true, loadId, ownerOperatorId }, 200);
  } catch (error) {
    console.error('[POST /api/admin/loads]', error);
    return json(
      { error: 'An unexpected error occurred while creating the load.' },
      500
    );
  }
}

export const POST = withCors(handlePost);
