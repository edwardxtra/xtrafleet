import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase-admin-singleton';
import { handleApiError, handleApiSuccess } from '@/lib/api-error-handler';
import { withCors } from '@/lib/api-cors';
import { rateLimiters, getIdentifier, formatTimeRemaining } from '@/lib/rate-limit';
import { FieldValue } from 'firebase-admin/firestore';

async function handlePost(request: NextRequest) {
  try {
    // Apply rate limiting by IP (before auth, for registration)
    const identifier = getIdentifier(request);
    const { success, reset } = await rateLimiters.registration.limit(identifier);

    if (!success) {
      return NextResponse.json(
        {
          error: 'Too many registration attempts',
          message: `Please try again in ${formatTimeRemaining(reset)}`,
        },
        { status: 429 }
      );
    }

    const { email, password, token, ownerId, profileData } = await request.json();

    console.log('[Create Driver] Request received:', { email, token, ownerId });

    // Validate required fields
    if (!email || !password || !token || !ownerId) {
      throw new Error('Missing required fields');
    }

    // Get Firebase Admin
    const { auth, db } = await getFirebaseAdmin();

    // Create Firebase Auth user
    console.log('[Create Driver] Creating Firebase user:', email);
    const userRecord = await auth.createUser({
      email: email,
      password: password,
      emailVerified: false,
    });

    console.log('[Create Driver] User created:', userRecord.uid);

    // Save driver profile to Firestore
    const driverDocRef = db.collection('owner_operators').doc(ownerId).collection('drivers').doc(userRecord.uid);
    
    await driverDocRef.set({
      ...profileData,
      id: userRecord.uid,
      ownerId: ownerId,
      email: email,
      status: 'active',
      availability: 'Available',
      createdAt: FieldValue.serverTimestamp(),
      userId: userRecord.uid,
    });

    console.log('[Create Driver] Profile saved to Firestore');

    // Create user role document
    await db.collection('users').doc(userRecord.uid).set({
      role: 'driver',
      email: email,
      ownerId: ownerId,
      driverId: userRecord.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    
    console.log('[Create Driver] User role document created');

    // Mark invitation as used
    await db.collection('driver_invitations').doc(token).update({
      status: 'used',
      usedAt: FieldValue.serverTimestamp(),
      driverId: userRecord.uid,
    });

    console.log('[Create Driver] Invitation marked as used');

    return handleApiSuccess({
      success: true,
      driverId: userRecord.uid,
    });

  } catch (error) {
    // Determine error type
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage.includes('Missing required fields')) {
      return handleApiError('missingFields', error instanceof Error ? error : new Error(errorMessage), {
        endpoint: 'POST /api/create-driver-account'
      });
    }
    
    if (errorMessage.includes('email-already-exists') || errorMessage.includes('already in use')) {
      return handleApiError('conflict', error instanceof Error ? error : new Error(errorMessage), {
        endpoint: 'POST /api/create-driver-account'
      });
    }
    
    // Generic server error
    return handleApiError('server', error instanceof Error ? error : new Error(errorMessage), {
      endpoint: 'POST /api/create-driver-account'
    });
  }
}

// Export with CORS protection
export const POST = withCors(handlePost);
