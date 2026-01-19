import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/firebase/server-auth';
import { getFirebaseAdmin } from '@/lib/firebase-admin-singleton';
import { handleApiError, handleApiSuccess } from '@/lib/api-error-handler';
import { withCors } from '@/lib/api-cors';

// POST is now handled by /api/add-new-driver
// We keep GET here for fetching the list of drivers.

async function handleGet(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    const { db } = await getFirebaseAdmin();
    const driversCollection = db.collection(`owner_operators/${user.uid}/drivers`);
    // Only display active drivers in the main list
    const querySnapshot = await driversCollection.where('status', '==', 'active').get();
    const drivers = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    return handleApiSuccess(drivers);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage === 'Unauthorized') {
      return handleApiError('unauthorized', error instanceof Error ? error : new Error(errorMessage), {
        endpoint: 'GET /api/drivers'
      });
    }
    
    return handleApiError('server', error instanceof Error ? error : new Error(errorMessage), {
      endpoint: 'GET /api/drivers'
    });
  }
}

// Export with CORS protection
export const GET = withCors(handleGet);
