import { NextRequest, NextResponse } from 'next/server';
import { initializeFirebaseAdmin } from '@/lib/firebase/server-auth';
import { handleError } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    // Initialize Firebase Admin
    const adminApp = await initializeFirebaseAdmin();
    if (!adminApp) {
      console.error('[validate-invitation] Firebase Admin not initialized');
      return handleError(
        new Error('Firebase Admin not initialized'),
        'Server configuration error. Please contact support.',
        500
      );
    }

    const db = adminApp.firestore();

    // Get invitation from Firestore
    const invitationDoc = await db.collection('driver_invitations').doc(token).get();

    if (!invitationDoc.exists) {
      return NextResponse.json(
        { error: 'Invalid invitation token' },
        { status: 404 }
      );
    }

    const invitation = invitationDoc.data();

    // Check if expired
    const now = new Date();
    const expiresAt = invitation?.expiresAt?.toDate();

    if (expiresAt && expiresAt < now) {
      return NextResponse.json(
        { error: 'This invitation has expired' },
        { status: 400 }
      );
    }

    // Check if already used
    if (invitation?.status !== 'pending') {
      return NextResponse.json(
        { error: 'This invitation has already been used' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      invitation: {
        email: invitation?.email,
        ownerId: invitation?.ownerId,
        status: invitation?.status,
        expiresAt: invitation?.expiresAt,
      },
    });

  } catch (error: any) {
    console.error('[validate-invitation] Error:', error);
    return handleError(error, 'Failed to validate invitation');
  }
}
