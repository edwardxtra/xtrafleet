import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
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

/**
 * Verify token - handles both ID tokens and session cookies
 */
async function verifyToken(auth: any, tokenValue: string) {
  // Try verifying as session cookie first (most common for logged-in users)
  try {
    return await auth.verifySessionCookie(tokenValue, true);
  } catch (sessionError) {
    // If that fails, try as regular ID token
    try {
      return await auth.verifyIdToken(tokenValue);
    } catch (idTokenError) {
      throw new Error('Invalid authentication token');
    }
  }
}

async function handlePost(req: NextRequest) {
  try {
    console.log('[Loads] POST request received');
    
    // Get Firebase Admin
    const { auth, db } = await getFirebaseAdmin();
    
    // Get token from cookie
    const token = req.cookies.get('fb-id-token');
    if (!token) {
      throw new Error('Unauthorized');
    }

    // Verify token (handles both session cookies and ID tokens)
    const decodedToken = await verifyToken(auth, token.value);
    console.log('[Loads] User authenticated:', decodedToken.uid);
    
    // Parse and validate request body
    const body = await req.json();
    const validation = loadSchema.safeParse(body);

    if (!validation.success) {
      const errorMessage = Object.values(validation.error.flatten().fieldErrors).flat().join(', ');
      throw new Error(errorMessage);
    }
    
    const newLoadData = { ...validation.data, ownerOperatorId: decodedToken.uid };
    
    console.log('[Loads] Creating load for user:', decodedToken.uid);
    const docRef = await db.collection(`owner_operators/${decodedToken.uid}/loads`).add(newLoadData);
    console.log('[Loads] Load created:', docRef.id);

    return handleApiSuccess({ id: docRef.id, ...newLoadData }, 201);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage === 'Unauthorized' || errorMessage === 'Invalid authentication token') {
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
    
    // Get Firebase Admin
    const { auth, db } = await getFirebaseAdmin();
    
    // Get token from cookie
    const token = req.cookies.get('fb-id-token');
    if (!token) {
      throw new Error('Unauthorized');
    }

    // Verify token (handles both session cookies and ID tokens)
    const decodedToken = await verifyToken(auth, token.value);
    console.log('[Loads] User authenticated:', decodedToken.uid);
        
    // Get loads
    const loadsCollection = db.collection(`owner_operators/${decodedToken.uid}/loads`);
    const querySnapshot = await loadsCollection.get();
    const loads = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    console.log('[Loads] Retrieved loads:', loads.length);

    return handleApiSuccess(loads);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage === 'Unauthorized' || errorMessage === 'Invalid authentication token') {
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
