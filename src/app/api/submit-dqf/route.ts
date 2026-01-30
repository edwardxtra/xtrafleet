import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin, FieldValue } from '@/lib/firebase-admin-singleton';
import { handleApiError, handleApiSuccess } from '@/lib/api-error-handler';
import { withCors } from '@/lib/api-cors';
import { getStorage } from 'firebase-admin/storage';

/**
 * Verify token - handles both ID tokens and session cookies
 */
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
    // Get Firebase Admin
    const { auth, db } = await getFirebaseAdmin();
    
    // Get token from cookie
    const token = req.cookies.get('fb-id-token');
    if (!token) {
      throw new Error('Unauthorized');
    }

    // Verify token
    const driverUser = await verifyToken(auth, token.value);
    console.log('[Submit DQF] User authenticated:', driverUser.uid);

    // Get request body
    const body = await req.json();
    const { personalInfo, employmentHistory, accidentHistory, cdlImages, trafficViolations } = body;

    // Validate required fields
    if (!personalInfo || !employmentHistory || !cdlImages) {
      throw new Error('Missing required DQF information');
    }

    // Get user role to find ownerId
    const userDoc = await db.collection('users').doc(driverUser.uid).get();
    const userData = userDoc.data();
    
    if (!userData || userData.role !== 'driver') {
      throw new Error('User is not a driver');
    }

    const ownerId = userData.ownerId;
    const driverId = driverUser.uid;

    console.log('[Submit DQF] Uploading CDL images to Firebase Storage');

    // Upload CDL images to Firebase Storage
    const bucket = getStorage().bucket();
    const cdlFrontPath = `drivers/${driverId}/cdl-front-${Date.now()}.jpg`;
    const cdlBackPath = `drivers/${driverId}/cdl-back-${Date.now()}.jpg`;

    // Upload front image
    const frontFile = bucket.file(cdlFrontPath);
    await frontFile.save(Buffer.from(cdlImages.front, 'base64'), {
      contentType: 'image/jpeg',
      metadata: {
        metadata: {
          driverId: driverId,
          documentType: 'cdl-front'
        }
      }
    });
    await frontFile.makePublic();
    const cdlFrontUrl = `https://storage.googleapis.com/${bucket.name}/${cdlFrontPath}`;

    // Upload back image
    const backFile = bucket.file(cdlBackPath);
    await backFile.save(Buffer.from(cdlImages.back, 'base64'), {
      contentType: 'image/jpeg',
      metadata: {
        metadata: {
          driverId: driverId,
          documentType: 'cdl-back'
        }
      }
    });
    await backFile.makePublic();
    const cdlBackUrl = `https://storage.googleapis.com/${bucket.name}/${cdlBackPath}`;

    console.log('[Submit DQF] CDL images uploaded successfully');

    // Save DQF data to driver document
    const driverRef = db.collection('owner_operators').doc(ownerId).collection('drivers').doc(driverId);
    
    await driverRef.update({
      dqf: {
        personalInfo,
        employmentHistory,
        accidentHistory,
        cdlImages: {
          frontUrl: cdlFrontUrl,
          backUrl: cdlBackUrl
        },
        trafficViolations
      },
      dqfStatus: 'submitted',
      dqfSubmittedAt: FieldValue.serverTimestamp(),
    });

    console.log('[Submit DQF] DQF data saved successfully');

    return handleApiSuccess({
      success: true,
      message: 'DQF submitted successfully',
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage === 'Unauthorized' || errorMessage === 'Invalid authentication token') {
      return handleApiError('unauthorized', error instanceof Error ? error : new Error(errorMessage), {
        endpoint: 'POST /api/submit-dqf'
      });
    }
    
    if (errorMessage.includes('Missing required')) {
      return handleApiError('validation', error instanceof Error ? error : new Error(errorMessage), {
        endpoint: 'POST /api/submit-dqf'
      });
    }
    
    return handleApiError('server', error instanceof Error ? error : new Error(errorMessage), {
      endpoint: 'POST /api/submit-dqf'
    });
  }
}

export const POST = withCors(handlePost);
