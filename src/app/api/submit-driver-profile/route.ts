import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin, FieldValue } from '@/lib/firebase-admin-singleton';
import { handleApiError, handleApiSuccess } from '@/lib/api-error-handler';
import { withCors } from '@/lib/api-cors';

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
    const { driverId, cdlInfo, driverConsents } = body;

    if (!driverId || !cdlInfo || !driverConsents) {
      throw new Error('Missing required fields');
    }

    // Get driver document path (find in which owner's collection)
    const userDoc = await db.collection('users').doc(user.uid).get();
    const userData = userDoc.data();
    if (!userData?.ownerId) throw new Error('Owner not found');

    const driverRef = db.collection('owner_operators').doc(userData.ownerId).collection('drivers').doc(user.uid);

    await driverRef.update({
      ...cdlInfo,
      driverConsents,
      profileStatus: 'pending_confirmation',
      profileSubmittedAt: FieldValue.serverTimestamp(),
      profileComplete: false,
    });

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
