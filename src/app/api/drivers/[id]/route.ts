import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/api-auth';
import { getFirebaseAdmin } from '@/lib/firebase-admin-singleton';
import { handleApiError, handleApiSuccess } from '@/lib/api-error-handler';

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
  try {
    const user = await authenticateRequest(req);
    const { db } = await getFirebaseAdmin();

    const driverId = params.id;
    const docRef = db.doc(`owner_operators/${user.uid}/drivers/${driverId}`);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return handleApiError('notFound', new Error('Driver not found'), {
        endpoint: 'GET /api/drivers/[id]',
        userId: user.uid,
      });
    }

    return handleApiSuccess({ id: docSnap.id, ...docSnap.data() });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return handleApiError('auth', error, { endpoint: 'GET /api/drivers/[id]' });
    }
    return handleApiError('server', error instanceof Error ? error : new Error('Unknown error'), {
      endpoint: 'GET /api/drivers/[id]',
    });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authenticateRequest(req);
    const { db } = await getFirebaseAdmin();

    const driverId = params.id;
    const docRef = db.doc(`owner_operators/${user.uid}/drivers/${driverId}`);
    const body = await req.json();

    const validation = driverUpdateSchema.safeParse(body);
    if (!validation.success) {
      const fieldErrors = validation.error.flatten().fieldErrors;
      return NextResponse.json({ error: 'Invalid input', fieldErrors }, { status: 400 });
    }

    await docRef.update(validation.data);
    return handleApiSuccess({ message: 'Driver updated successfully' });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return handleApiError('auth', error, { endpoint: 'PUT /api/drivers/[id]' });
    }
    return handleApiError('server', error instanceof Error ? error : new Error('Unknown error'), {
      endpoint: 'PUT /api/drivers/[id]',
    });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authenticateRequest(req);
    const { db } = await getFirebaseAdmin();

    const driverId = params.id;
    const docRef = db.doc(`owner_operators/${user.uid}/drivers/${driverId}`);
    await docRef.delete();

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return handleApiError('auth', error, { endpoint: 'DELETE /api/drivers/[id]' });
    }
    return handleApiError('server', error instanceof Error ? error : new Error('Unknown error'), {
      endpoint: 'DELETE /api/drivers/[id]',
    });
  }
}
