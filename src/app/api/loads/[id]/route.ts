import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getFirebaseAdmin } from '@/lib/firebase-admin-singleton';
import { handleApiError, handleApiSuccess } from '@/lib/api-error-handler';
import { addCorsHeaders, checkOrigin, handleOptions } from '@/lib/api-cors';

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

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (req.method === 'OPTIONS') return handleOptions(req);
  const originError = checkOrigin(req);
  if (originError) return originError;

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
    const response = handleApiSuccess({
      id: docSnap.id,
      ...data,
      status: data.status || 'live',
      loadType: data.loadType || data.cargo || 'general-freight',
      driverCompensation: data.driverCompensation || data.price || 0,
      cdlClassRequired: data.cdlClassRequired || [],
      endorsementsRequired: data.endorsementsRequired || [],
    });
    return addCorsHeaders(response, req);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    let response;
    if (msg === 'Unauthorized') response = handleApiError('unauthorized', error instanceof Error ? error : new Error(msg), { endpoint: 'GET /api/loads/[id]' });
    else if (msg === 'Not found') response = handleApiError('notFound', error instanceof Error ? error : new Error(msg), { endpoint: 'GET /api/loads/[id]' });
    else response = handleApiError('server', error instanceof Error ? error : new Error(msg), { endpoint: 'GET /api/loads/[id]' });
    return addCorsHeaders(response, req);
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  if (req.method === 'OPTIONS') return handleOptions(req);
  const originError = checkOrigin(req);
  if (originError) return originError;

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

    if (FULLY_EDITABLE_STATUSES.includes(currentStatus)) {
      // All fields editable
    } else if (LIMITED_EDITABLE_STATUSES.includes(currentStatus)) {
      const allowedFields = ['additionalDetails', 'status'];
      const attemptedFields = Object.keys(updates).filter(k => (updates as any)[k] !== undefined);
      const disallowedFields = attemptedFields.filter(f => !allowedFields.includes(f));
      if (disallowedFields.length > 0) {
        throw new Error(`Cannot edit ${disallowedFields.join(', ')} while status is '${currentStatus}'. Only notes can be edited.`);
      }
    } else {
      throw new Error(`Load cannot be edited while status is '${currentStatus}'.`);
    }

    const updateData: any = { ...updates, updatedAt: new Date().toISOString() };
    if (updates.driverCompensation) updateData.price = updates.driverCompensation;
    if (updates.loadType) updateData.cargo = updates.loadType;

    await docRef.update(updateData);
    const response = handleApiSuccess({ message: 'Load updated successfully' });
    return addCorsHeaders(response, req);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    let response;
    if (msg === 'Unauthorized') response = handleApiError('unauthorized', error instanceof Error ? error : new Error(msg), { endpoint: 'PUT /api/loads/[id]' });
    else if (msg === 'Not found') response = handleApiError('notFound', error instanceof Error ? error : new Error(msg), { endpoint: 'PUT /api/loads/[id]' });
    else if (msg.includes('Cannot edit') || msg.includes('cannot be edited')) response = NextResponse.json({ error: msg }, { status: 403 });
    else response = handleApiError('server', error instanceof Error ? error : new Error(msg), { endpoint: 'PUT /api/loads/[id]' });
    return addCorsHeaders(response, req);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (req.method === 'OPTIONS') return handleOptions(req);
  const originError = checkOrigin(req);
  if (originError) return originError;

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

    if (currentStatus === 'draft') {
      await docRef.delete();
      const response = new NextResponse(null, { status: 204 });
      return addCorsHeaders(response, req);
    }

    if (CANCELLABLE_STATUSES.includes(currentStatus)) {
      await docRef.update({ status: 'cancelled', cancelledAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      const response = handleApiSuccess({ message: 'Load cancelled successfully', status: 'cancelled' });
      return addCorsHeaders(response, req);
    }

    throw new Error(`Cannot delete load with status '${currentStatus}'. Use cancellation flow for matched loads.`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    let response;
    if (msg === 'Unauthorized') response = handleApiError('unauthorized', error instanceof Error ? error : new Error(msg), { endpoint: 'DELETE /api/loads/[id]' });
    else if (msg === 'Not found') response = handleApiError('notFound', error instanceof Error ? error : new Error(msg), { endpoint: 'DELETE /api/loads/[id]' });
    else if (msg.includes('Cannot delete')) response = NextResponse.json({ error: msg }, { status: 403 });
    else response = handleApiError('server', error instanceof Error ? error : new Error(msg), { endpoint: 'DELETE /api/loads/[id]' });
    return addCorsHeaders(response, req);
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}
