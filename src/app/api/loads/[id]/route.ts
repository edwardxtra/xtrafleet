import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getFirebaseAdmin } from '@/lib/firebase-admin-singleton';
import { handleApiError, handleApiSuccess } from '@/lib/api-error-handler';
import { withCors } from '@/lib/api-cors';

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

async function handleGet(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Get Firebase Admin
    const { auth, db } = await getFirebaseAdmin();
    
    // Get token from cookie
    const token = req.cookies.get('fb-id-token');
    if (!token) {
      throw new Error('Unauthorized');
    }

    // Verify token
    const user = await auth.verifyIdToken(token.value);

    const loadId = params.id;
    const docRef = db.doc(`owner_operators/${user.uid}/loads/${loadId}`);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      throw new Error('Not found');
    }

    return handleApiSuccess({ id: docSnap.id, ...docSnap.data() });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage === 'Unauthorized') {
      return handleApiError('unauthorized', error instanceof Error ? error : new Error(errorMessage), {
        endpoint: 'GET /api/loads/[id]'
      });
    }
    
    if (errorMessage === 'Not found') {
      return handleApiError('notFound', error instanceof Error ? error : new Error(errorMessage), {
        endpoint: 'GET /api/loads/[id]'
      });
    }
    
    return handleApiError('server', error instanceof Error ? error : new Error(errorMessage), {
      endpoint: 'GET /api/loads/[id]'
    });
  }
}

async function handlePut(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Get Firebase Admin
    const { auth, db } = await getFirebaseAdmin();
    
    // Get token from cookie
    const token = req.cookies.get('fb-id-token');
    if (!token) {
      throw new Error('Unauthorized');
    }

    // Verify token
    const user = await auth.verifyIdToken(token.value);

    const loadId = params.id;
    const docRef = db.doc(`owner_operators/${user.uid}/loads/${loadId}`);
    const body = await req.json();
    
    const validation = loadUpdateSchema.safeParse(body);
    if (!validation.success) {
      const errorMessage = Object.values(validation.error.flatten().fieldErrors).flat().join(', ');
      throw new Error(errorMessage);
    }

    await docRef.update(validation.data);
    return handleApiSuccess({ message: 'Load updated successfully' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage === 'Unauthorized') {
      return handleApiError('unauthorized', error instanceof Error ? error : new Error(errorMessage), {
        endpoint: 'PUT /api/loads/[id]'
      });
    }
    
    if (errorMessage.includes('required') || errorMessage.includes('positive')) {
      return handleApiError('validation', error instanceof Error ? error : new Error(errorMessage), {
        endpoint: 'PUT /api/loads/[id]'
      });
    }
    
    return handleApiError('server', error instanceof Error ? error : new Error(errorMessage), {
      endpoint: 'PUT /api/loads/[id]'
    });
  }
}

async function handleDelete(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Get Firebase Admin
    const { auth, db } = await getFirebaseAdmin();
    
    // Get token from cookie
    const token = req.cookies.get('fb-id-token');
    if (!token) {
      throw new Error('Unauthorized');
    }

    // Verify token
    const user = await auth.verifyIdToken(token.value);

    const loadId = params.id;
    const docRef = db.doc(`owner_operators/${user.uid}/loads/${loadId}`);
    await docRef.delete();

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage === 'Unauthorized') {
      return handleApiError('unauthorized', error instanceof Error ? error : new Error(errorMessage), {
        endpoint: 'DELETE /api/loads/[id]'
      });
    }
    
    return handleApiError('server', error instanceof Error ? error : new Error(errorMessage), {
      endpoint: 'DELETE /api/loads/[id]'
    });
  }
}

// Export with CORS protection
export const GET = withCors(handleGet);
export const PUT = withCors(handlePut);
export const DELETE = withCors(handleDelete);
