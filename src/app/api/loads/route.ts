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
  try {
    console.log('[API /loads POST] Request received');
    
    const adminApp = await initializeFirebaseAdmin();
    if (!adminApp) {
      console.error('[API /loads POST] Firebase Admin initialization failed');
      return handleError(
        new Error('Firebase Admin not initialized'), 
        'Server configuration error. Please contact support if this persists.', 
        500
      );
    }

    const user = await getAuthenticatedUser(req as any);
    if (!user) {
      console.warn('[API /loads POST] User authentication failed');
      return handleError(new Error('Unauthorized'), 'You must be logged in to create loads', 401);
    }

    console.log(`[API /loads POST] User authenticated: ${user.uid}`);

    const firestore = adminApp.firestore();
    
    let body;
    try {
      body = await req.json();
      console.log('[API /loads POST] Request body parsed successfully');
    } catch (parseError: any) {
      console.error('[API /loads POST] Failed to parse request body:', parseError);
      return handleError(parseError, 'Invalid request body. Please check your data and try again.', 400);
    }

    const validation = loadSchema.safeParse(body);

    if (!validation.success) {
      const fieldErrors = validation.error.flatten().fieldErrors;
      const errorMessage = Object.values(fieldErrors).flat().join(', ');
      console.warn('[API /loads POST] Validation failed:', errorMessage);
      return NextResponse.json({ error: errorMessage, fieldErrors }, { status: 400 });
    }
    
    const newLoadData = { ...validation.data, ownerOperatorId: user.uid };
    
    console.log(`[API /loads POST] Creating load for user ${user.uid}`);
    const docRef = await firestore.collection(`owner_operators/${user.uid}/loads`).add(newLoadData);
    console.log(`[API /loads POST] ✓ Load created successfully: ${docRef.id}`);

    return NextResponse.json({ id: docRef.id, ...newLoadData }, { status: 201 });
  } catch (error: any) {
    console.error('[API /loads POST] Unexpected error:', error);
    return handleError(error, 'Failed to create load. Please try again.');
  }
}

export async function GET(req: NextRequest) {
  try {
    console.log('[API /loads GET] Request received');
    
    const adminApp = await initializeFirebaseAdmin();
    if (!adminApp) {
      console.error('[API /loads GET] Firebase Admin initialization failed');
      return handleError(
        new Error('Firebase Admin not initialized'), 
        'Server configuration error. Please contact support if this persists.', 
        500
      );
    }
    
    const user = await getAuthenticatedUser(req as any);
    if (!user) {
      console.warn('[API /loads GET] User authentication failed');
      return handleError(new Error('Unauthorized'), 'You must be logged in to view loads', 401);
    }

    console.log(`[API /loads GET] User authenticated: ${user.uid}`);
        
    const firestore = adminApp.firestore();
    const loadsCollection = firestore.collection(`owner_operators/${user.uid}/loads`);
    const querySnapshot = await loadsCollection.get();
    const loads = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    console.log(`[API /loads GET] ✓ Retrieved ${loads.length} loads for user ${user.uid}`);

    return NextResponse.json(loads, { status: 200 });
  } catch (error: any) {
    console.error('[API /loads GET] Unexpected error:', error);
    return handleError(error, 'Failed to fetch loads. Please try again.');
  }
}
