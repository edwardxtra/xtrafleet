import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getFirebaseAdmin } from '@/lib/firebase-admin-singleton';
import { handleApiError, handleApiSuccess } from '@/lib/api-error-handler';
import { withCors } from '@/lib/api-cors';

const FULLY_EDITABLE_STATUSES = ['draft', 'live'];
const LIMITED_EDITABLE_STATUSES = ['match_pending'];
const CANCELLABLE_STATUSES = ['live', 'match_pending'];

const loadUpdateSchema = z.object({
  origin: z.string().min(1).optional(),
  destination: z.string().min(1).optional(),
  loadType: z.string().min(1).optional(),
  driverCompensation: z.number().positive().optional(),
  pickupDate: z.string().min(1).optional(),
  estimatedDeliveryDate: z.string().optional(),
  trailerType: z.string().optional(),
  cdlClassRequired: z.array(z.string()).optional(),
  endorsementsRequired: z.array(z.string()).optional(),
  additionalDetails: z.string().optional(),
  status: z.enum(['draft', 'live', 'match_pending', 'driver_matched', 'in_progress', 'completed', 'cancelled']).optional(),
  // Legacy fields
  cargo: z.string().optional(),
  price: z.number().positive().optional(),
  weight: z.number().positive().optional(),
}).partial();

async function verifyToken(auth: any, tokenValue: string) {
  try {
    return await auth.verifySessionCookie(tokenValue, true);
  } catch {
    return await auth.verifyIdToken(tokenValue);
  }
}

async function handleGet(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { auth, db } = await getFirebaseAdmin();
    const token = req.cookies.get('fb-id-token');
    if (!token) throw new Error('Unauthorized');
    const user = await verifyToken(auth, token.value);

    const loadId = params.id;
    const docRef = db.doc(`owner_operators/${user.uid}/loads/${loadId}`);
    const docSnap = await docRef.get();
    if (!docSnap.exists) throw new Error('Not found');

    const data = docSnap.data()!;
    return handleApiSuccess({
      id: docSnap.id,
      ...data,
      status: data.status || 'live',
      loadType: data.loadType || data.cargo || 'general-freight',
      driverCompensation: data.driverCompensation || data.price || 0,
      cdlClassRequired: data.cdlClassRequired || [],
      endorsementsRequired: data.endorsementsRequired || [],
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage === 'Unauthorized') return handleApiError('unauthorized', error instanceof Error ? error : new Error(errorMessage), { endpoint: 'GET /api/loads/[id]' });
    if (errorMessage === 'Not found') return handleApiError('notFound', error instanceof Error ? error : new Error(errorMessage), { endpoint: 'GET /api/loads/[id]' });
    return handleApiError('server', error instanceof Error ? error : new Error(errorMessage), { endpoint: 'GET /api/loads/[id]' });
  }
}

async function handlePut(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { auth, db } = await getFirebaseAdmin();
    const token = req.cookies.get('fb-id-token');
    if (!token) throw new Error('Unauthorized');
    const user = await verifyToken(auth, token.value);

    const loadId = params.id;
    const docRef = db.doc(`owner_operators/${user.uid}/loads/${loadId}`);
    const docSnap = await docRef.get();
    if (!docSnap.exists) throw new Error('Not found');

    const currentData = docSnap.data()!;
    const currentStatus = currentData.status || 'live';

    const body = await req.json();
    const validation = loadUpdateSchema.safeParse(body);
    if (!validation.success) {
      const errorMessage = Object.values(validation.error.flatten().fieldErrors).flat().join(', ');
      throw new Error(errorMessage);
    }

    const updates = validation.data;

    // Status-aware edit guardrails
    if (FULLY_EDITABLE_STATUSES.includes(currentStatus)) {
      // All fields editable
    } else if (LIMITED_EDITABLE_STATUSES.includes(currentStatus)) {
      // Only allow additionalDetails and status changes
      const allowedFields = ['additionalDetails', 'status'];
      const attemptedFields = Object.keys(updates).filter(k => !(updates as any)[k] === undefined);
      const disallowedFields = attemptedFields.filter(f => !allowedFields.includes(f));
      if (disallowedFields.length > 0) {
        throw new Error(`Cannot edit ${disallowedFields.join(', ')} while status is '${currentStatus}'. Only notes can be edited.`);
      }
    } else {
      // Locked — no edits allowed (except status transitions by system)
      throw new Error(`Load cannot be edited while status is '${currentStatus}'.`);
    }

    // Keep backward compatibility
    const updateData: any = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    if (updates.driverCompensation) updateData.price = updates.driverCompensation;
    if (updates.loadType) updateData.cargo = updates.loadType;

    await docRef.update(updateData);
    return handleApiSuccess({ message: 'Load updated successfully' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage === 'Unauthorized') return handleApiError('unauthorized', error instanceof Error ? error : new Error(errorMessage), { endpoint: 'PUT /api/loads/[id]' });
    if (errorMessage === 'Not found') return handleApiError('notFound', error instanceof Error ? error : new Error(errorMessage), { endpoint: 'PUT /api/loads/[id]' });
    if (errorMessage.includes('Cannot edit') || errorMessage.includes('cannot be edited')) {
      return NextResponse.json({ error: errorMessage }, { status: 403 });
    }
    return handleApiError('server', error instanceof Error ? error : new Error(errorMessage), { endpoint: 'PUT /api/loads/[id]' });
  }
}

async function handleDelete(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { auth, db } = await getFirebaseAdmin();
    const token = req.cookies.get('fb-id-token');
    if (!token) throw new Error('Unauthorized');
    const user = await verifyToken(auth, token.value);

    const loadId = params.id;
    const docRef = db.doc(`owner_operators/${user.uid}/loads/${loadId}`);
    const docSnap = await docRef.get();
    if (!docSnap.exists) throw new Error('Not found');

    const currentData = docSnap.data()!;
    const currentStatus = currentData.status || 'live';

    // Draft loads: hard delete
    if (currentStatus === 'draft') {
      await docRef.delete();
      return new NextResponse(null, { status: 204 });
    }

    // Live / Match Pending: soft delete (transition to cancelled)
    if (CANCELLABLE_STATUSES.includes(currentStatus)) {
      await docRef.update({
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return handleApiSuccess({ message: 'Load cancelled successfully', status: 'cancelled' });
    }

    // Driver Matched and beyond: cannot delete
    throw new Error(`Cannot delete load with status '${currentStatus}'. Use cancellation flow for matched loads.`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage === 'Unauthorized') return handleApiError('unauthorized', error instanceof Error ? error : new Error(errorMessage), { endpoint: 'DELETE /api/loads/[id]' });
    if (errorMessage === 'Not found') return handleApiError('notFound', error instanceof Error ? error : new Error(errorMessage), { endpoint: 'DELETE /api/loads/[id]' });
    if (errorMessage.includes('Cannot delete')) {
      return NextResponse.json({ error: errorMessage }, { status: 403 });
    }
    return handleApiError('server', error instanceof Error ? error : new Error(errorMessage), { endpoint: 'DELETE /api/loads/[id]' });
  }
}

export const GET = withCors(handleGet);
export const PUT = withCors(handlePut);
export const DELETE = withCors(handleDelete);
