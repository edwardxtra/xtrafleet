import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getFirebaseAdmin, FieldValue } from '@/lib/firebase-admin-singleton';
import { handleApiError, handleApiSuccess } from '@/lib/api-error-handler';
import { withCors } from '@/lib/api-cors';
import { logAuditEvent, AuditActions } from '@/lib/audit-logger';

const LOG_PREFIX = '[submit-self-driver-profile]';

const bodySchema = z.object({
  driverId: z.string().min(1, 'driverId required'),
  profileData: z.record(z.any()),
  consents: z.record(z.any()),
  deviceInfo: z.record(z.any()).optional(),
});

async function verifyToken(auth: any, tokenValue: string) {
  try {
    return await auth.verifySessionCookie(tokenValue, true);
  } catch {
    return await auth.verifyIdToken(tokenValue);
  }
}

// OO-self-driver completion endpoint. Mirrors /api/submit-driver-profile but
// the calling user is the OWNER, not the driver — the driver doc has an
// auto-generated id (not the owner's uid) and isSelfDriver === true.
async function handlePost(req: NextRequest) {
  try {
    const { auth, db } = await getFirebaseAdmin();
    const token = req.cookies.get('fb-id-token');
    if (!token) {
      console.warn(`${LOG_PREFIX} No auth token found in cookies`);
      throw new Error('Unauthorized');
    }

    const user = await verifyToken(auth, token.value);
    console.log(`${LOG_PREFIX} Authenticated owner uid: ${user.uid}`);

    const body = await req.json();
    const validation = bodySchema.safeParse(body);
    if (!validation.success) {
      const errs = Object.values(validation.error.flatten().fieldErrors).flat().join(', ');
      throw new Error(errs || 'Invalid request body');
    }
    const { driverId, profileData, consents, deviceInfo } = validation.data;

    // Verify the caller actually owns the target driver record and that the
    // record is flagged as a self-driver. This is the only path that lets an
    // OO write to a driver doc they don't have a matching uid for.
    const driverRef = db
      .collection('owner_operators')
      .doc(user.uid)
      .collection('drivers')
      .doc(driverId);

    const driverDoc = await driverRef.get();
    if (!driverDoc.exists) {
      console.error(`${LOG_PREFIX} Driver doc not found at owner_operators/${user.uid}/drivers/${driverId}`);
      throw new Error('Driver document not found');
    }
    const driverData = driverDoc.data() || {};
    if (driverData.isSelfDriver !== true) {
      console.error(`${LOG_PREFIX} Driver ${driverId} is not a self-driver record — refusing to update via this endpoint`);
      throw new Error('Driver is not a self-driver record');
    }

    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const timestamp = new Date().toISOString();
    const enhancedConsents = Object.entries(consents).reduce(
      (acc, [key, value]: [string, any]) => ({
        ...acc,
        [key]: {
          ...value,
          ipAddress,
          deviceInfo: deviceInfo || {},
          timestamp,
        },
      }),
      {},
    );

    // Match the field normalization /api/submit-driver-profile does so the
    // compliance engine sees one canonical shape.
    const normalizedProfileData = { ...profileData };
    if (normalizedProfileData.medicalCertExpiration !== undefined) {
      normalizedProfileData.medicalCardExpiry = normalizedProfileData.medicalCertExpiration;
      delete normalizedProfileData.medicalCertExpiration;
    }

    await driverRef.update({
      ...normalizedProfileData,
      driverConsents: enhancedConsents,
      profileStatus: 'pending_confirmation',
      profileSubmittedAt: FieldValue.serverTimestamp(),
      profileComplete: false,
    });

    console.log(`${LOG_PREFIX} Self-driver profile saved for owner ${user.uid}, driverDoc ${driverId}`);

    await logAuditEvent({
      action: AuditActions.DRIVER_PROFILE_SUBMITTED,
      userId: user.uid,
      userRole: 'owner_operator',
      targetId: driverId,
      targetType: 'driver',
      metadata: {
        selfDriver: true,
        cdlState: normalizedProfileData.cdlState,
        cdlClass: normalizedProfileData.cdlClass,
        hasEndorsements: Array.isArray(normalizedProfileData.endorsements) && normalizedProfileData.endorsements.length > 0,
        medicalCardExpiry: normalizedProfileData.medicalCardExpiry,
      },
      ipAddress,
      userAgent: req.headers.get('user-agent') || undefined,
    });

    // Skip the owner-notification email — the owner IS the submitter here, so
    // no need to email themselves.

    return handleApiSuccess({
      success: true,
      profileStatus: 'pending_confirmation',
      message: 'Self-driver profile submitted successfully.',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`${LOG_PREFIX} Error:`, errorMessage, error);
    if (errorMessage === 'Unauthorized') {
      return handleApiError('unauthorized', error instanceof Error ? error : new Error(errorMessage), {
        endpoint: 'POST /api/submit-self-driver-profile',
      });
    }
    return handleApiError('server', error instanceof Error ? error : new Error(errorMessage), {
      endpoint: 'POST /api/submit-self-driver-profile',
    });
  }
}

export const POST = withCors(handlePost);
