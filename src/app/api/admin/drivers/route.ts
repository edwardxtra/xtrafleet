/**
 * Admin: create a driver on behalf of an owner-operator (DEV-170).
 *
 * Completes the white-glove onboarding loop. After pre-registering a fleet
 * via /admin/onboard, the white-glove team uses this endpoint to populate
 * that fleet's drivers so a real compliance-verified match can be formed
 * on their behalf before they ever activate.
 *
 * Gating: `drivers:edit` permission (same as the edit flow). Target
 * owner-operator must exist; can be pre-activated or active.
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
  // Required identity
  name: z.string().trim().min(1, 'Driver name is required'),
  email: z.string().trim().email().optional().or(z.literal('')),
  phoneNumber: z.string().trim().optional(),
  location: z.string().trim().optional(),
  vehicleType: z.string().trim().optional(),
  availability: z.string().trim().optional(),
  trailerTypes: z.array(z.string()).optional(),
  // CDL
  cdlLicense: z.string().trim().optional(),
  cdlState: z.string().trim().optional(),
  cdlClass: z.string().trim().optional(),
  cdlExpiry: z.string().trim().optional(),
  cdlLicenseUrl: z.string().trim().optional(),
  cdlDocumentUrl: z.string().trim().optional(),
  endorsements: z.string().trim().optional(),
  // Medical + insurance
  medicalCardExpiry: z.string().trim().optional(),
  medicalCardUrl: z.string().trim().optional(),
  insuranceExpiry: z.string().trim().optional(),
  insuranceUrl: z.string().trim().optional(),
  insurerName: z.string().trim().optional(),
  insurancePolicyNumber: z.string().trim().optional(),
  // MVR + screenings
  motorVehicleRecordNumber: z.string().trim().optional(),
  mvrUrl: z.string().trim().optional(),
  backgroundCheckDate: z.string().trim().optional(),
  backgroundCheckUrl: z.string().trim().optional(),
  preEmploymentScreeningDate: z.string().trim().optional(),
  preEmploymentScreeningUrl: z.string().trim().optional(),
  drugAndAlcoholScreeningDate: z.string().trim().optional(),
  drugAndAlcoholScreeningUrl: z.string().trim().optional(),
  // Compliance status (DEV-167 dropdown values)
  clearinghouseStatus: z.string().trim().optional(),
  dqfStatus: z.string().trim().optional(),
  profileStatus: z.string().trim().optional(),
  // Eligibility flag
  isActive: z.boolean().optional(),
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

    // 2. Authorize — drivers:edit.
    const adminSnap = await db.collection('owner_operators').doc(adminUid).get();
    const adminData = adminSnap.exists ? adminSnap.data() : null;
    if (!adminData?.isAdmin) {
      return json({ error: 'Admin access required.' }, 403);
    }
    const role: AdminRole = (adminData.adminRole as AdminRole) || getDefaultRoleForLegacyAdmin();
    if (!hasPermission(role, 'drivers:edit')) {
      return json({ error: 'You do not have permission to add drivers.' }, 403);
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

    // 5. Create the driver. Default profileStatus to 'confirmed' for the
    //    admin-created path (decision recorded on DEV-170): the admin has
    //    already verified the driver offline.
    const driverRef = db
      .collection('owner_operators')
      .doc(input.ownerOperatorId)
      .collection('drivers')
      .doc();
    const driverId = driverRef.id;
    const now = new Date().toISOString();

    const { ownerOperatorId, ...rest } = input;
    const driverDoc: Record<string, unknown> = {
      id: driverId,
      ...rest,
      profileStatus: input.profileStatus || 'confirmed',
      profileComplete: true,
      availability: input.availability || 'Available',
      isActive: input.isActive ?? true,
      trailerTypes: input.trailerTypes ?? [],
      createdByAdmin: adminUid,
      createdAt: now,
      updatedAt: FieldValue.serverTimestamp(),
    };

    await driverRef.set(driverDoc);

    // 6. Audit.
    await db.collection('audit_logs').add({
      action: 'driver_created_by_admin',
      adminId: adminUid,
      adminEmail,
      targetType: 'driver',
      targetId: driverId,
      targetName: input.name,
      details: {
        ownerOperatorId,
        ownerName: ownerData.companyName || ownerData.legalName || '',
      },
      timestamp: FieldValue.serverTimestamp(),
      createdAt: now,
    });

    return json({ success: true, driverId, ownerOperatorId }, 200);
  } catch (error) {
    console.error('[POST /api/admin/drivers]', error);
    return json(
      { error: 'An unexpected error occurred while creating the driver.' },
      500
    );
  }
}

export const POST = withCors(handlePost);
