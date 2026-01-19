import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/firebase/server-auth';
import { getFirebaseAdmin } from '@/lib/firebase-admin-singleton';
import { handleApiError, handleApiSuccess } from '@/lib/api-error-handler';
import { withCors } from '@/lib/api-cors';

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

async function handlePost(req: NextRequest) {
  try {
    console.log('[Loads] POST request received');
    
    // Authenticate user
    const user = await getAuthenticatedUser(req as any);
    if (!user) {
      throw new Error('Unauthorized');
    }

    console.log('[Loads] User authenticated:', user.uid);

    // Get Firestore
    const { db } = await getFirebaseAdmin();
    
    // Parse and validate request body
    const body = await req.json();
    const validation = loadSchema.safeParse(body);

    if (!validation.success) {
      const errorMessage = Object.values(validation.error.flatten().fieldErrors).flat().join(', ');
      throw new Error(errorMessage);
    }
    
    const newLoadData = { ...validation.data, ownerOperatorId: user.uid };
    
    console.log('[Loads] Creating load for user:', user.uid);
    const docRef = await db.collection(`owner_operators/${user.uid}/loads`).add(newLoadData);
    console.log('[Loads] Load created:', docRef.id);

    return handleApiSuccess({ id: docRef.id, ...newLoadData }, 201);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage === 'Unauthorized') {
      return handleApiError('unauthorized', error instanceof Error ? error : new Error(errorMessage), {
        endpoint: 'POST /api/loads',
        userId: 'unknown'
      });
    }
    
    if (errorMessage.includes('required') || errorMessage.includes('positive')) {
      return handleApiError('validation', error instanceof Error ? error : new Error(errorMessage), {
        endpoint: 'POST /api/loads'
      });
    }
    
    return handleApiError('server', error instanceof Error ? error : new Error(errorMessage), {
      endpoint: 'POST /api/loads'
    });
  }
}

async function handleGet(req: NextRequest) {
  try {
    console.log('[Loads] GET request received');
    
    // Authenticate user
    const user = await getAuthenticatedUser(req as any);
    if (!user) {
      throw new Error('Unauthorized');
    }

    console.log('[Loads] User authenticated:', user.uid);
        
    // Get Firestore
    const { db } = await getFirebaseAdmin();
    const loadsCollection = db.collection(`owner_operators/${user.uid}/loads`);
    const querySnapshot = await loadsCollection.get();
    const loads = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    console.log('[Loads] Retrieved loads:', loads.length);

    return handleApiSuccess(loads);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage === 'Unauthorized') {
      return handleApiError('unauthorized', error instanceof Error ? error : new Error(errorMessage), {
        endpoint: 'GET /api/loads'
      });
    }
    
    return handleApiError('server', error instanceof Error ? error : new Error(errorMessage), {
      endpoint: 'GET /api/loads'
    });
  }
}

// Export with CORS protection
export const POST = withCors(handlePost);
export const GET = withCors(handleGet);
