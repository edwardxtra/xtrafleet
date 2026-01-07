import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { initializeFirebaseAdmin } from '@/lib/firebase/server-auth';

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

    await initializeFirebaseAdmin();
    const auth = admin.auth();
    const db = admin.firestore();

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
      id: userRecord.uid, // ADD THIS LINE - drivers list page needs it
      ownerId: ownerId,
      email: email,
      status: 'active',
      availability: 'Available', // ADD THIS LINE - set default availability
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      userId: userRecord.uid,
    });

    console.log('✅ Driver profile saved to Firestore');

    await db.collection('users').doc(userRecord.uid).set({
      role: 'driver',
      email: email,
      ownerId: ownerId,
      driverId: userRecord.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log('✅ User role document created');

    // Mark invitation as used
    await db.collection('driver_invitations').doc(token).update({
      status: 'used',
      usedAt: admin.firestore.FieldValue.serverTimestamp(),
      driverId: userRecord.uid,
    });

    console.log('✅ Invitation marked as used');

    return NextResponse.json({
      success: true,
      driverId: userRecord.uid,
    });

  } catch (error: any) {
    console.error('❌ Create driver account error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create account' },
      { status: 500 }
    );
  }
}
