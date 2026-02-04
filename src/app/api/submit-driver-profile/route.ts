import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin, FieldValue } from '@/lib/firebase-admin-singleton';
import { handleApiError, handleApiSuccess } from '@/lib/api-error-handler';
import { withCors } from '@/lib/api-cors';
import { sendDriverProfileSubmittedEmail } from '@/lib/send-notification-email';
import { logAuditEvent, AuditActions } from '@/lib/audit-logger';

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
    if (!token) throw new Error('Unauthorized');

    const user = await verifyToken(auth, token.value);
    const body = await req.json();
    const { profileData, consents, deviceInfo } = body;

    if (!profileData || !consents) {
      throw new Error('Missing required fields');
    }

    // Get driver document path
    const userDoc = await db.collection('users').doc(user.uid).get();
    const userData = userDoc.data();
    if (!userData?.ownerId) throw new Error('Owner not found');

    const driverRef = db.collection('owner_operators').doc(userData.ownerId).collection('drivers').doc(user.uid);
    const driverDoc = await driverRef.get();
    const driverData = driverDoc.data();

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

    await driverRef.update({
      ...profileData,
      driverConsents: enhancedConsents,
      profileStatus: 'pending_confirmation',
      profileSubmittedAt: FieldValue.serverTimestamp(),
      profileComplete: false,
    });

    // Log audit event
    await logAuditEvent({
      action: AuditActions.DRIVER_PROFILE_SUBMITTED,
      userId: user.uid,
      userRole: 'driver',
      targetId: user.uid,
      targetType: 'driver',
      metadata: {
        cdlState: profileData.cdlState,
        cdlClass: profileData.cdlClass,
        hasEndorsements: (profileData.endorsements || []).length > 0,
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

      await sendDriverProfileSubmittedEmail({
        ownerEmail: ownerData.email,
        ownerName: ownerData.legalName || ownerData.companyName || 'Fleet Owner',
        driverName,
        driverId: user.uid,
      });
    }

    return handleApiSuccess({
      success: true,
      profileStatus: 'pending_confirmation',
      message: 'Profile submitted successfully. Awaiting fleet attestation.',
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
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
