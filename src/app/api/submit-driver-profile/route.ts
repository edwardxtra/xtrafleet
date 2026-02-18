import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin, FieldValue } from '@/lib/firebase-admin-singleton';
import { handleApiError, handleApiSuccess } from '@/lib/api-error-handler';
import { withCors } from '@/lib/api-cors';
import { sendDriverProfileSubmittedEmail } from '@/lib/send-notification-email';
import { logAuditEvent, AuditActions } from '@/lib/audit-logger';

const LOG_PREFIX = '[submit-driver-profile]';

async function verifyToken(auth: any, tokenValue: string) {
  try {
    return await auth.verifySessionCookie(tokenValue, true);
  } catch {
    return await auth.verifyIdToken(tokenValue);
  }
}

async function handlePost(req: NextRequest) {
  try {
    const { auth, db } = await getFirebaseAdmin();
    const token = req.cookies.get('fb-id-token');
    if (!token) {
      console.warn(`${LOG_PREFIX} No auth token found in cookies`);
      throw new Error('Unauthorized');
    }

    const user = await verifyToken(auth, token.value);
    console.log(`${LOG_PREFIX} Authenticated user: ${user.uid}`);

    const body = await req.json();
    const { profileData, consents, deviceInfo } = body;

    if (!profileData || !consents) {
      console.error(`${LOG_PREFIX} Missing required fields. profileData: ${!!profileData}, consents: ${!!consents}`);
      throw new Error('Missing required fields');
    }

    console.log(`${LOG_PREFIX} Profile data fields received:`, Object.keys(profileData));

    // Get driver document path
    const userDoc = await db.collection('users').doc(user.uid).get();
    const userData = userDoc.data();
    if (!userData?.ownerId) {
      console.error(`${LOG_PREFIX} Owner not found for user: ${user.uid}. userData:`, userData);
      throw new Error('Owner not found');
    }

    console.log(`${LOG_PREFIX} Found ownerId: ${userData.ownerId} for driver: ${user.uid}`);

    const driverRef = db.collection('owner_operators').doc(userData.ownerId).collection('drivers').doc(user.uid);
    const driverDoc = await driverRef.get();
    const driverData = driverDoc.data();

    if (!driverDoc.exists()) {
      console.error(`${LOG_PREFIX} Driver document not found at owner_operators/${userData.ownerId}/drivers/${user.uid}`);
      throw new Error('Driver document not found');
    }

    // Get IP address from request
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';

    // Add IP and device info to consents
    const timestamp = new Date().toISOString();
    const enhancedConsents = Object.entries(consents).reduce((acc, [key, value]: [string, any]) => ({
      ...acc,
      [key]: {
        ...value,
        ipAddress,
        deviceInfo: deviceInfo || {},
        timestamp,
      }
    }), {});

    // IMPORTANT: Normalize field names before saving.
    // The form submits `medicalCertExpiration` but the driver doc and compliance
    // engine use `medicalCardExpiry`. We remap here so there's one source of truth.
    const normalizedProfileData = { ...profileData };
    if (normalizedProfileData.medicalCertExpiration !== undefined) {
      console.log(
        `${LOG_PREFIX} Remapping medicalCertExpiration → medicalCardExpiry: ${normalizedProfileData.medicalCertExpiration}`
      );
      normalizedProfileData.medicalCardExpiry = normalizedProfileData.medicalCertExpiration;
      delete normalizedProfileData.medicalCertExpiration;
    }

    // Log key compliance fields being saved so we can verify them in Firestore
    console.log(`${LOG_PREFIX} Saving compliance fields:`, {
      cdlNumber: normalizedProfileData.cdlNumber,
      cdlState: normalizedProfileData.cdlState,
      cdlClass: normalizedProfileData.cdlClass,
      cdlExpiry: normalizedProfileData.cdlExpiry,
      medicalCardExpiry: normalizedProfileData.medicalCardExpiry,
      endorsements: normalizedProfileData.endorsements,
    });

    await driverRef.update({
      ...normalizedProfileData,
      driverConsents: enhancedConsents,
      profileStatus: 'pending_confirmation',
      profileSubmittedAt: FieldValue.serverTimestamp(),
      profileComplete: false,
    });

    console.log(`${LOG_PREFIX} Driver profile saved successfully for: ${user.uid}`);

    // Log audit event
    await logAuditEvent({
      action: AuditActions.DRIVER_PROFILE_SUBMITTED,
      userId: user.uid,
      userRole: 'driver',
      targetId: user.uid,
      targetType: 'driver',
      metadata: {
        cdlState: normalizedProfileData.cdlState,
        cdlClass: normalizedProfileData.cdlClass,
        hasEndorsements: (normalizedProfileData.endorsements || []).length > 0,
        medicalCardExpiry: normalizedProfileData.medicalCardExpiry,
      },
      ipAddress,
      userAgent: req.headers.get('user-agent') || undefined,
    });

    // Get owner info for email
    const ownerDoc = await db.collection('owner_operators').doc(userData.ownerId).get();
    const ownerData = ownerDoc.data();

    // Send email notification to owner
    if (ownerData?.email) {
      const driverName = driverData?.firstName && driverData?.lastName
        ? `${driverData.firstName} ${driverData.lastName}`
        : driverData?.name || 'Driver';

      console.log(`${LOG_PREFIX} Sending profile submitted email to owner: ${ownerData.email}`);
      await sendDriverProfileSubmittedEmail({
        ownerEmail: ownerData.email,
        ownerName: ownerData.legalName || ownerData.companyName || 'Fleet Owner',
        driverName,
        driverId: user.uid,
      });
    } else {
      console.warn(`${LOG_PREFIX} No owner email found for ownerId: ${userData.ownerId}, skipping notification`);
    }

    return handleApiSuccess({
      success: true,
      profileStatus: 'pending_confirmation',
      message: 'Profile submitted successfully. Awaiting fleet attestation.',
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`${LOG_PREFIX} Error:`, errorMessage, error);

    if (errorMessage === 'Unauthorized') {
      return handleApiError('unauthorized', error instanceof Error ? error : new Error(errorMessage), {
        endpoint: 'POST /api/submit-driver-profile'
      });
    }
    return handleApiError('server', error instanceof Error ? error : new Error(errorMessage), {
      endpoint: 'POST /api/submit-driver-profile'
    });
  }
}

export const POST = withCors(handlePost);
