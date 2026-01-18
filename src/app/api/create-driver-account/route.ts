import { NextRequest, NextResponse } from 'next/server';
import { initializeFirebaseAdmin } from '@/lib/firebase/server-auth';
import { handleError } from '@/lib/api-utils';

export async function POST(request: NextRequest) {
  try {
    const { email, password, token, ownerId, profileData } = await request.json();

    console.log('🔵 Create driver account - Received:', { email, token, ownerId });

    if (!email || !password || !token || !ownerId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const adminApp = await initializeFirebaseAdmin();
    if (!adminApp) {
      console.error('[create-driver-account] Firebase Admin not initialized');
      return handleError(
        new Error('Firebase Admin not initialized'),
        'Server configuration error. Please contact support.',
        500
      );
    }

    const auth = adminApp.auth();
    const db = adminApp.firestore();

    // Create Firebase Auth user
    console.log('🔵 Creating Firebase user:', email);
    const userRecord = await auth.createUser({
      email: email,
      password: password,
      emailVerified: false,
    });

    console.log('✅ Firebase user created:', userRecord.uid);

    // Save driver profile to Firestore
    const driverDocRef = db.collection('owner_operators').doc(ownerId).collection('drivers').doc(userRecord.uid);
    
    await driverDocRef.set({
      ...profileData,
      id: userRecord.uid,
      ownerId: ownerId,
      email: email,
      status: 'active',
      availability: 'Available',
      createdAt: db.FieldValue.serverTimestamp(),
      userId: userRecord.uid,
    });

    console.log('✅ Driver profile saved to Firestore');

    await db.collection('users').doc(userRecord.uid).set({
      role: 'driver',
      email: email,
      ownerId: ownerId,
      driverId: userRecord.uid,
      createdAt: db.FieldValue.serverTimestamp(),
    });
    console.log('✅ User role document created');

    // Mark invitation as used
    await db.collection('driver_invitations').doc(token).update({
      status: 'used',
      usedAt: db.FieldValue.serverTimestamp(),
      driverId: userRecord.uid,
    });

    console.log('✅ Invitation marked as used');

    return NextResponse.json({
      success: true,
      driverId: userRecord.uid,
    });

  } catch (error: any) {
    console.error('❌ Create driver account error:', error);
    return handleError(error, 'Failed to create account');
  }
}
