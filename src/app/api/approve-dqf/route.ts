import { NextRequest } from 'next/server';
import { getFirebaseAdmin, FieldValue } from '@/lib/firebase-admin-singleton';
import { handleApiError, handleApiSuccess } from '@/lib/api-error-handler';
import { withCors } from '@/lib/api-cors';

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

    const ownerUser = await verifyToken(auth, token.value);
    const body = await req.json();
    const { driverId, action } = body; // action: 'approve' or 'reject'

    if (!driverId || !action) {
      throw new Error('Missing required fields');
    }

    const ownerId = ownerUser.uid;
    const driverRef = db.collection('owner_operators').doc(ownerId).collection('drivers').doc(driverId);
    
    const updateData: any = {
      dqfStatus: action === 'approve' ? 'approved' : 'rejected',
    };

    if (action === 'approve') {
      updateData.dqfApprovedAt = FieldValue.serverTimestamp();
      updateData.dqfApprovedBy = ownerId;
    }

    await driverRef.update(updateData);

    return handleApiSuccess({ 
      success: true, 
      message: action === 'approve' ? 'DQF approved successfully' : 'DQF rejected'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage === 'Unauthorized' || errorMessage === 'Invalid authentication token') {
      return handleApiError('unauthorized', error instanceof Error ? error : new Error(errorMessage), { endpoint: 'POST /api/approve-dqf' });
    }
    return handleApiError('server', error instanceof Error ? error : new Error(errorMessage), { endpoint: 'POST /api/approve-dqf' });
  }
}

export const POST = withCors(handlePost);