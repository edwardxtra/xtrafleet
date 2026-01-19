import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase-admin-singleton';
import { handleApiError, handleApiSuccess } from '@/lib/api-error-handler';
import { withCors } from '@/lib/api-cors';

async function handleGet(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');

    if (!token) {
      throw new Error('Missing token');
    }

    // Get Firebase Admin
    const { db } = await getFirebaseAdmin();

    // Get invitation from Firestore
    const invitationDoc = await db.collection('driver_invitations').doc(token).get();

    if (!invitationDoc.exists) {
      throw new Error('Invalid token');
    }

    const invitation = invitationDoc.data();

    // Check if expired
    const now = new Date();
    const expiresAt = invitation?.expiresAt?.toDate();

    if (expiresAt && expiresAt < now) {
      throw new Error('Invitation expired');
    }

    // Check if already used
    if (invitation?.status !== 'pending') {
      throw new Error('Invitation already used');
    }

    return handleApiSuccess({
      success: true,
      invitation: {
        email: invitation?.email,
        ownerId: invitation?.ownerId,
        status: invitation?.status,
        expiresAt: invitation?.expiresAt,
      },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage === 'Missing token') {
      return handleApiError('missingFields', error instanceof Error ? error : new Error(errorMessage), {
        endpoint: 'GET /api/validate-invitation'
      });
    }
    
    if (errorMessage === 'Invalid token') {
      return handleApiError('notFound', error instanceof Error ? error : new Error(errorMessage), {
        endpoint: 'GET /api/validate-invitation'
      });
    }
    
    if (errorMessage === 'Invitation expired' || errorMessage === 'Invitation already used') {
      return handleApiError('validation', error instanceof Error ? error : new Error(errorMessage), {
        endpoint: 'GET /api/validate-invitation'
      });
    }
    
    return handleApiError('server', error instanceof Error ? error : new Error(errorMessage), {
      endpoint: 'GET /api/validate-invitation'
    });
  }
}

// Export with CORS protection
export const GET = withCors(handleGet);
