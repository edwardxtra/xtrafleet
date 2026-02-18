import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getFirebaseAdmin, FieldValue } from '@/lib/firebase-admin-singleton';
import { handleApiError, handleApiSuccess } from '@/lib/api-error-handler';
import { withCors } from '@/lib/api-cors';

const selfDriverSchema = z.object({
  firstName: z.string().min(1, 'First name required'),
  lastName: z.string().min(1, 'Last name required'),
  phoneNumber: z.string().optional(),
  location: z.string().optional(),
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

    // Check if OO has already added themselves as a driver
    const existing = await db
      .collection(`owner_operators/${ownerUser.uid}/drivers`)
      .where('isSelfDriver', '==', true)
      .limit(1)
      .get();

    if (!existing.empty) {
      throw new Error('You have already added yourself as a driver.');
    }

    const driverRef = db.collection(`owner_operators/${ownerUser.uid}/drivers`).doc();

    await driverRef.set({
      name: `${data.firstName} ${data.lastName}`.trim(),
      firstName: data.firstName,
      lastName: data.lastName,
      phoneNumber: data.phoneNumber || null,
      location: data.location || null,
      vehicleTypes: data.vehicleTypes || [],
      cdlLicense: data.cdlLicense || null,
      cdlExpiry: data.cdlExpiry || null,
      medicalCardExpiry: data.medicalCardExpiry || null,
      endorsements: data.endorsements || null,
      ownerId: ownerUser.uid,
      isSelfDriver: true,
      availability: 'Off-duty',
      isActive: true,
      profileComplete: false,
      profileStatus: 'self_driver',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return handleApiSuccess({ driverId: driverRef.id, message: 'Added yourself as a driver.' }, 201);

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
