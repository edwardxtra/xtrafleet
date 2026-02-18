import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin, FieldValue } from '@/lib/firebase-admin-singleton';
import { handleApiError, handleApiSuccess } from '@/lib/api-error-handler';
import { withCors } from '@/lib/api-cors';
import { sendDriverConfirmedEmail } from '@/lib/send-notification-email';
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
    const { driverId, confirmed } = body;

    if (!driverId || confirmed === undefined) {
      throw new Error('Missing required fields');
    }

    const driverRef = db.collection('owner_operators').doc(user.uid).collection('drivers').doc(driverId);
    const driverDoc = await driverRef.get();
    const driverData = driverDoc.data();

    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';

    if (confirmed) {
      await driverRef.update({
        profileStatus: 'confirmed',
        profileComplete: true,
        confirmedAt: FieldValue.serverTimestamp(),
        confirmedBy: user.uid,
      });

      // Log audit event
      await logAuditEvent({
        action: AuditActions.DRIVER_PROFILE_CONFIRMED,
        userId: user.uid,
        userRole: 'owner_operator',
        targetId: driverId,
        targetType: 'driver',
        metadata: {
          driverName: driverData?.firstName && driverData?.lastName
            ? `${driverData.firstName} ${driverData.lastName}`
            : driverData?.name,
        },
        ipAddress,
        userAgent: req.headers.get('user-agent') || undefined,
      });

      // Send email notification to driver
      if (driverData?.email) {
        const driverName = driverData?.firstName && driverData?.lastName
          ? `${driverData.firstName} ${driverData.lastName}`
          : driverData?.name || 'Driver';

        // Get owner company name
        const ownerDoc = await db.collection('owner_operators').doc(user.uid).get();
        const ownerData = ownerDoc.data();

        await sendDriverConfirmedEmail({
          driverEmail: driverData.email,
          driverName,
          ownerCompanyName: ownerData?.legalName || ownerData?.companyName || 'Your Fleet',
        });
      }

      return handleApiSuccess({
        success: true,
        profileStatus: 'confirmed',
        message: 'Driver confirmed and eligible for leasing.',
      });
    } else {
      await driverRef.update({
        profileStatus: 'rejected',
        rejectedAt: FieldValue.serverTimestamp(),
        rejectedBy: user.uid,
      });

      // Log audit event
      await logAuditEvent({
        action: AuditActions.DRIVER_PROFILE_REJECTED,
        userId: user.uid,
        userRole: 'owner_operator',
        targetId: driverId,
        targetType: 'driver',
        metadata: {
          driverName: driverData?.firstName && driverData?.lastName
            ? `${driverData.firstName} ${driverData.lastName}`
            : driverData?.name,
        },
        ipAddress,
        userAgent: req.headers.get('user-agent') || undefined,
      });

      return handleApiSuccess({
        success: true,
        profileStatus: 'rejected',
        message: 'Driver profile rejected.',
      });
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage === 'Unauthorized') {
      return handleApiError('unauthorized', error instanceof Error ? error : new Error(errorMessage), {
        endpoint: 'POST /api/confirm-driver'
      });
    }
    return handleApiError('server', error instanceof Error ? error : new Error(errorMessage), {
      endpoint: 'POST /api/confirm-driver'
    });
  }
}

export const POST = withCors(handlePost);
