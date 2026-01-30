import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin, FieldValue } from '@/lib/firebase-admin-singleton';
import { handleApiError, handleApiSuccess } from '@/lib/api-error-handler';
import { withCors } from '@/lib/api-cors';
import { getStorage } from 'firebase-admin/storage';

async function verifyToken(auth: any, tokenValue: string) {
  try {
    return await auth.verifySessionCookie(tokenValue, true);
  } catch (sessionError) {
    try {
      return await auth.verifyIdToken(tokenValue);
    } catch (idTokenError) {
      throw new Error('Invalid authentication token');
    }
  }
}

async function handlePost(req: NextRequest) {
  try {
    const { auth, db } = await getFirebaseAdmin();
    const token = req.cookies.get('fb-id-token');
    if (!token) throw new Error('Unauthorized');

    const driverUser = await verifyToken(auth, token.value);
    const body = await req.json();
    const { personalInfo, employmentHistory, accidentHistory, cdlImages, trafficViolations } = body;

    if (!personalInfo || !employmentHistory || !cdlImages) {
      throw new Error('Missing required DQF information');
    }

    const userDoc = await db.collection('users').doc(driverUser.uid).get();
    const userData = userDoc.data();
    if (!userData || userData.role !== 'driver') throw new Error('User is not a driver');

    const ownerId = userData.ownerId;
    const driverId = driverUser.uid;
    const bucket = getStorage().bucket();
    
    // Upload CDL images
    const cdlFrontPath = `drivers/${driverId}/cdl-front-${Date.now()}.jpg`;
    const cdlBackPath = `drivers/${driverId}/cdl-back-${Date.now()}.jpg`;

    const frontFile = bucket.file(cdlFrontPath);
    await frontFile.save(Buffer.from(cdlImages.front, 'base64'), {
      contentType: 'image/jpeg',
      metadata: { metadata: { driverId, documentType: 'cdl-front' } }
    });
    await frontFile.makePublic();
    const cdlFrontUrl = `https://storage.googleapis.com/${bucket.name}/${cdlFrontPath}`;

    const backFile = bucket.file(cdlBackPath);
    await backFile.save(Buffer.from(cdlImages.back, 'base64'), {
      contentType: 'image/jpeg',
      metadata: { metadata: { driverId, documentType: 'cdl-back' } }
    });
    await backFile.makePublic();
    const cdlBackUrl = `https://storage.googleapis.com/${bucket.name}/${cdlBackPath}`;

    const driverRef = db.collection('owner_operators').doc(ownerId).collection('drivers').doc(driverId);
    await driverRef.update({
      dqf: {
        personalInfo,
        employmentHistory,
        accidentHistory,
        cdlImages: { frontUrl: cdlFrontUrl, backUrl: cdlBackUrl },
        trafficViolations
      },
      dqfStatus: 'submitted',
      dqfSubmittedAt: FieldValue.serverTimestamp(),
    });

    return handleApiSuccess({ success: true, message: 'DQF submitted successfully' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage === 'Unauthorized' || errorMessage === 'Invalid authentication token') {
      return handleApiError('unauthorized', error instanceof Error ? error : new Error(errorMessage), { endpoint: 'POST /api/submit-dqf' });
    }
    if (errorMessage.includes('Missing required')) {
      return handleApiError('validation', error instanceof Error ? error : new Error(errorMessage), { endpoint: 'POST /api/submit-dqf' });
    }
    return handleApiError('server', error instanceof Error ? error : new Error(errorMessage), { endpoint: 'POST /api/submit-dqf' });
  }
}

export const POST = withCors(handlePost);