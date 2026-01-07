
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser, initializeFirebaseAdmin } from '@/lib/firebase/server-auth';
import { handleError } from '@/lib/api-utils';

const driverUpdateSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  email: z.string().email('Invalid email address').optional(),
  phoneNumber: z.string().min(1, 'Phone number is required').optional(),
  cdlLicense: z.string().min(1, 'CDL License is required').optional(),
  availability: z.enum(['Available', 'On-trip', 'Off-duty']).optional(),
  location: z.string().optional(),
  vehicleType: z.enum(['Dry Van', 'Reefer', 'Flatbed']).optional(),
  certifications: z.array(z.string()).optional(),
  profileSummary: z.string().optional(),
  cdlExpiry: z.string().optional(),
  medicalCardExpiry: z.string().optional(),
  insuranceExpiry: z.string().optional(),
  motorVehicleRecordNumber: z.string().optional(),
  backgroundCheckDate: z.string().optional(),
  preEmploymentScreeningDate: z.string().optional(),
  drugAndAlcoholScreeningDate: z.string().optional(),
}).partial();

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const adminApp = initializeFirebaseAdmin();
  if (!adminApp) {
    return handleError(new Error('Server misconfigured'), 'Server configuration error. Cannot connect to backend services.', 500);
  }

  try {
    const user = await getAuthenticatedUser(req as any);
    if (!user) {
      return handleError(new Error('Unauthorized'), 'Unauthorized', 401);
    }

    const firestore = adminApp.firestore();
    const driverId = params.id;
    const docRef = firestore.doc(`owner_operators/${user.uid}/drivers/${driverId}`);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return handleError(new Error('Driver not found'), 'Driver not found', 404);
    }

    return NextResponse.json({ id: docSnap.id, ...docSnap.data() }, { status: 200 });
  } catch (error) {
    return handleError(error, 'Failed to fetch driver');
  }
}


export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const adminApp = initializeFirebaseAdmin();
  if (!adminApp) {
    return handleError(new Error('Server misconfigured'), 'Server configuration error. Cannot connect to backend services.', 500);
  }

  try {
    const user = await getAuthenticatedUser(req as any);
    if (!user) {
      return handleError(new Error('Unauthorized'), 'Unauthorized', 401);
    }

    const firestore = adminApp.firestore();
    const driverId = params.id;
    const docRef = firestore.doc(`owner_operators/${user.uid}/drivers/${driverId}`);
    const body = await req.json();
    
    const validation = driverUpdateSchema.safeParse(body);
    if (!validation.success) {
      const fieldErrors = validation.error.flatten().fieldErrors;
      const errorMessage = Object.values(fieldErrors).flat().join(', ');
      return NextResponse.json({ error: errorMessage, fieldErrors }, { status: 400 });
    }

    await docRef.update(validation.data);
    return NextResponse.json({ message: 'Driver updated successfully' }, { status: 200 });
  } catch (error) {
    return handleError(error, 'Failed to update driver');
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const adminApp = initializeFirebaseAdmin();
  if (!adminApp) {
    return handleError(new Error('Server misconfigured'), 'Server configuration error. Cannot connect to backend services.', 500);
  }
  
  try {
    const user = await getAuthenticatedUser(req as any);
    if (!user) {
      return handleError(new Error('Unauthorized'), 'Unauthorized', 401);
    }

    const firestore = adminApp.firestore();
    const driverId = params.id;
    const docRef = firestore.doc(`owner_operators/${user.uid}/drivers/${driverId}`);
    await docRef.delete();

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleError(error, 'Failed to delete driver');
  }
}
