import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser, initializeFirebaseAdmin } from '@/lib/firebase/server-auth';
import { handleError } from '@/lib/api-utils';

const loadSchema = z.object({
  origin: z.string().min(1, 'Origin is required'),
  destination: z.string().min(1, 'Destination is required'),
  price: z.number().positive('Price must be a positive number'),
  pickupDate: z.string().min(1, 'Pickup date is required'),
  cargo: z.string().min(1, 'Cargo type is required'),
  weight: z.number().positive('Weight must be a positive number'),
  additionalDetails: z.string().optional().default(''),
  status: z.enum(['Pending', 'In-transit', 'Delivered']).default('Pending'),
  requiredQualifications: z.array(z.string()).default([]),
});

export async function POST(req: NextRequest) {
  const adminApp = await initializeFirebaseAdmin();
  if (!adminApp) {
    return handleError(new Error('Server misconfigured'), 'Server configuration error. Cannot connect to backend services.', 500);
  }

  try {
    const user = await getAuthenticatedUser(req as any);
    if (!user) {
      return handleError(new Error('Unauthorized'), 'Unauthorized', 401);
    }

    const firestore = adminApp.firestore();
    const body = await req.json();
    const validation = loadSchema.safeParse(body);

    if (!validation.success) {
      const fieldErrors = validation.error.flatten().fieldErrors;
      const errorMessage = Object.values(fieldErrors).flat().join(', ');
      return NextResponse.json({ error: errorMessage, fieldErrors }, { status: 400 });
    }
    
    const newLoadData = { ...validation.data, ownerOperatorId: user.uid };
    const docRef = await firestore.collection(`owner_operators/${user.uid}/loads`).add(newLoadData);

    return NextResponse.json({ id: docRef.id, ...newLoadData }, { status: 201 });
  } catch (error: any) {
    return handleError(error, 'Failed to create load');
  }
}

export async function GET(req: NextRequest) {
  const adminApp = await initializeFirebaseAdmin();
  if (!adminApp) {
    return handleError(new Error('Server misconfigured'), 'Server configuration error. Cannot connect to backend services.', 500);
  }
    
  try {
    const user = await getAuthenticatedUser(req as any);
    if (!user) {
      return handleError(new Error('Unauthorized'), 'Unauthorized', 401);
    }
        
    const firestore = adminApp.firestore();
    const loadsCollection = firestore.collection(`owner_operators/${user.uid}/loads`);
    const querySnapshot = await loadsCollection.get();
    const loads = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    return NextResponse.json(loads, { status: 200 });
  } catch (error: any) {
    return handleError(error, 'Failed to fetch loads');
  }
}
