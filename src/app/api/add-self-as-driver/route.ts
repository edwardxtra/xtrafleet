import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getFirebaseAdmin, FieldValue } from '@/lib/firebase-admin-singleton';
import { handleApiError, handleApiSuccess } from '@/lib/api-error-handler';
import { withCors } from '@/lib/api-cors';

const selfDriverSchema = z.object({
  firstName: z.string().min(1, 'First name required'),
  lastName: z.string().min(1, 'Last name required'),
  location: z.string().optional(),
  phoneNumber: z.string().optional(),
  vehicleTypes: z.array(z.string()).optional(),
  cdlLicense: z.string().optional(),
  cdlExpiry: z.string().optional(),
  medicalCardExpiry: z.string().optional(),
  endorsements: z.string().optional(),
});

async function verifyToken(auth: any, tokenValue: string) {
  try {
    return await auth.verifySessionCookie(tokenValue, true);
  } catch {
    return await auth.verifyIdToken(tokenValue);
  }
}

async function handlePost(req: NextRequest) {
  try {
    const { auth, db } = await getFirebaseAdmin();
    const token = req.cookies.get('fb-id-token');
    if (!token) throw new Error('Unauthorized');

    const ownerUser = await verifyToken(auth, token.value);
    const body = await req.json();
    const validation = selfDriverSchema.safeParse(body);

    if (!validation.success) {
      throw new Error(Object.values(validation.error.flatten().fieldErrors).flat().join(', '));
    }

    const data = validation.data;

    // Check if a self-driver record already exists for this OO
    const existing = await db
      .collection(`owner_operators/${ownerUser.uid}/drivers`)
      .where('isSelfDriver', '==', true)
      .limit(1)
      .get();

    if (!existing.empty) {
      throw new Error('You have already added yourself as a driver.');
    }

    // Get OO profile for email
    const ownerDoc = await db.doc(`owner_operators/${ownerUser.uid}`).get();
    const ownerData = ownerDoc.data();
    const email = ownerData?.contactEmail || ownerData?.email || '';

    const driverRef = db.collection(`owner_operators/${ownerUser.uid}/drivers`).doc();
    await driverRef.set({
      name: `${data.firstName} ${data.lastName}`.trim(),
      firstName: data.firstName,
      lastName: data.lastName,
      email,
      location: data.location || '',
      phoneNumber: data.phoneNumber || '',
      vehicleTypes: data.vehicleTypes || [],
      vehicleType: data.vehicleTypes?.[0] || '',
      cdlLicense: data.cdlLicense || '',
      cdlExpiry: data.cdlExpiry || '',
      medicalCardExpiry: data.medicalCardExpiry || '',
      endorsements: data.endorsements || '',
      availability: 'Available',
      certifications: [],
      isActive: true,
      isSelfDriver: true,
      profileStatus: 'self',
      profileComplete: true,
      ownerId: ownerUser.uid,
      createdAt: FieldValue.serverTimestamp(),
    });

    return handleApiSuccess({
      driverId: driverRef.id,
      message: 'You have been added as a driver on your fleet.',
    }, 201);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage === 'Unauthorized') {
      return handleApiError('unauthorized', error instanceof Error ? error : new Error(errorMessage), {
        endpoint: 'POST /api/add-self-as-driver',
      });
    }
    return handleApiError('server', error instanceof Error ? error : new Error(errorMessage), {
      endpoint: 'POST /api/add-self-as-driver',
    });
  }
}

export const POST = withCors(handlePost);
