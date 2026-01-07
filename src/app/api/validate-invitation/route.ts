import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { initializeFirebaseAdmin } from '@/lib/firebase/server-auth';

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
    await initializeFirebaseAdmin();
    const db = admin.firestore();

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
    console.error('Validate invitation error:', error);
    return NextResponse.json(
      { error: 'Failed to validate invitation' },
      { status: 500 }
    );
  }
}
