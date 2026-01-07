
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser, initializeFirebaseAdmin } from '@/lib/firebase/server-auth';
import { handleError } from '@/lib/api-utils';

const loadUpdateSchema = z.object({
  origin: z.string().min(1, 'Origin is required').optional(),
  destination: z.string().min(1, 'Destination is required').optional(),
  price: z.number().positive('Price must be a positive number').optional(),
  pickupDate: z.string().datetime('Invalid datetime format').optional(),
  cargo: z.string().min(1, 'Cargo type is required').optional(),
  weight: z.number().positive('Weight must be a positive number').optional(),
  additionalDetails: z.string().optional(),
  status: z.enum(['Pending', 'In-transit', 'Delivered']).optional(),
  requiredQualifications: z.array(z.string()).optional(),
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
    const loadId = params.id;
    const docRef = firestore.doc(`owner_operators/${user.uid}/loads/${loadId}`);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return handleError(new Error('Load not found'), 'Load not found', 404);
    }

    return NextResponse.json({ id: docSnap.id, ...docSnap.data() }, { status: 200 });
  } catch (error) {
    return handleError(error, 'Failed to fetch load');
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
    const loadId = params.id;
    const docRef = firestore.doc(`owner_operators/${user.uid}/loads/${loadId}`);
    const body = await req.json();
    
    const validation = loadUpdateSchema.safeParse(body);
    if (!validation.success) {
      const fieldErrors = validation.error.flatten().fieldErrors;
      const errorMessage = Object.values(fieldErrors).flat().join(', ');
      return NextResponse.json({ error: errorMessage, fieldErrors }, { status: 400 });
    }

    await docRef.update(validation.data);
    return NextResponse.json({ message: 'Load updated successfully' }, { status: 200 });
  } catch (error) {
    return handleError(error, 'Failed to update load');
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
    const loadId = params.id;
    const docRef = firestore.doc(`owner_operators/${user.uid}/loads/${loadId}`);
    await docRef.delete();

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleError(error, 'Failed to delete load');
  }
}
