import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getFirebaseAdmin } from '@/lib/firebase-admin-singleton';
import { handleApiError, handleApiSuccess } from '@/lib/api-error-handler';
import { withCors } from '@/lib/api-cors';
import { rateLimiters, getIdentifier, formatTimeRemaining } from '@/lib/rate-limit';
import type { RouteInfo } from '@/lib/data';

const RADAR_SECRET_KEY = process.env.RADAR_SECRET_KEY;

async function geocodeAddress(address: string): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const params = new URLSearchParams({ query: address });
    const response = await fetch(`https://api.radar.io/v1/geocode/forward?${params}`, {
      method: 'GET',
      headers: { 'Authorization': RADAR_SECRET_KEY! },
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (data.addresses && data.addresses.length > 0) {
      const { latitude, longitude } = data.addresses[0];
      return { latitude, longitude };
    }
    return null;
  } catch { return null; }
}

async function calculateRoute(origin: string, destination: string): Promise<RouteInfo | null> {
  if (!RADAR_SECRET_KEY) return null;
  try {
    const [originCoords, destCoords] = await Promise.all([geocodeAddress(origin), geocodeAddress(destination)]);
    if (!originCoords || !destCoords) return null;
    const params = new URLSearchParams({
      origin: `${originCoords.latitude},${originCoords.longitude}`,
      destination: `${destCoords.latitude},${destCoords.longitude}`,
      modes: 'truck',
      units: 'imperial',
    });
    const response = await fetch(`https://api.radar.io/v1/route/distance?${params}`, {
      method: 'GET',
      headers: { 'Authorization': RADAR_SECRET_KEY },
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (data.meta?.code !== 200 || !data.routes?.truck) return null;
    const route = data.routes.truck;
    const distanceMiles = Math.round(route.distance.value / 1609.34);
    return {
      distanceMiles,
      distanceText: `${distanceMiles} mi`,
      durationSeconds: route.duration.value,
      durationText: route.duration.text || formatDuration(route.duration.value),
      calculatedAt: new Date().toISOString(),
    };
  } catch { return null; }
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}

const loadSchema = z.object({
  origin: z.string().min(1, 'Origin is required'),
  destination: z.string().min(1, 'Destination is required'),
  loadType: z.string().min(1, 'Load type is required'),
  driverCompensation: z.number().positive('Driver compensation must be a positive number'),
  pickupDate: z.string().min(1, 'Pickup date is required'),
  estimatedDeliveryDate: z.string().optional().default(''),
  trailerType: z.string().optional(),
  cdlClassRequired: z.array(z.string()).min(1, 'At least one CDL class is required'),
  endorsementsRequired: z.array(z.string()).default([]),
  additionalDetails: z.string().optional().default(''),
  status: z.enum(['draft', 'live', 'match_pending', 'driver_matched', 'in_progress', 'completed', 'cancelled']).default('live'),
  verificationConsent: z.object({
    accepted: z.boolean(),
    timestamp: z.string(),
    version: z.string(),
    text: z.string(),
  }).optional(),
  // Legacy fields for backward compatibility
  cargo: z.string().optional(),
  weight: z.number().optional(),
  price: z.number().optional(),
  requiredQualifications: z.array(z.string()).default([]),
});

async function verifyToken(auth: any, tokenValue: string) {
  try {
    return await auth.verifySessionCookie(tokenValue, true);
  } catch {
    return await auth.verifyIdToken(tokenValue);
  }
}

async function handlePost(req: NextRequest) {
  try {
    const { auth, db } = await getFirebaseAdmin();
    const token = req.cookies.get('fb-id-token');
    if (!token) throw new Error('Unauthorized');
    const decodedToken = await verifyToken(auth, token.value);

    const identifier = getIdentifier(req, decodedToken.uid);
    const { success, reset } = await rateLimiters.loads.limit(identifier);
    if (!success) {
      return NextResponse.json(
        { error: 'Too many load creation requests', message: `You can create more loads in ${formatTimeRemaining(reset)}` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const validation = loadSchema.safeParse(body);
    if (!validation.success) {
      const errorMessage = Object.values(validation.error.flatten().fieldErrors).flat().join(', ');
      throw new Error(errorMessage);
    }

    const { cargo, weight, price, requiredQualifications, ...restData } = validation.data;

    // Calculate truck route
    const route = await calculateRoute(restData.origin, restData.destination);

    const newLoadData = {
      ...restData,
      // Backward compatibility: store cargo as loadType label, price as driverCompensation
      cargo: cargo || restData.loadType,
      price: price || restData.driverCompensation,
      ownerOperatorId: decodedToken.uid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...(route && { route }),
    };

    const docRef = await db.collection(`owner_operators/${decodedToken.uid}/loads`).add(newLoadData);

    return handleApiSuccess({ id: docRef.id, ...newLoadData }, 201);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage === 'Unauthorized' || errorMessage === 'Invalid authentication token') {
      return handleApiError('unauthorized', error instanceof Error ? error : new Error(errorMessage), { endpoint: 'POST /api/loads' });
    }
    if (errorMessage.includes('required') || errorMessage.includes('positive')) {
      return handleApiError('validation', error instanceof Error ? error : new Error(errorMessage), { endpoint: 'POST /api/loads' });
    }
    return handleApiError('server', error instanceof Error ? error : new Error(errorMessage), { endpoint: 'POST /api/loads' });
  }
}

async function handleGet(req: NextRequest) {
  try {
    const { auth, db } = await getFirebaseAdmin();
    const token = req.cookies.get('fb-id-token');
    if (!token) throw new Error('Unauthorized');
    const decodedToken = await verifyToken(auth, token.value);

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get('status');

    let query: any = db.collection(`owner_operators/${decodedToken.uid}/loads`);
    
    if (statusFilter && statusFilter !== 'all') {
      query = query.where('status', '==', statusFilter);
    }

    const querySnapshot = await query.get();
    const loads = querySnapshot.docs.map((doc: any) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        // Normalize legacy loads that don't have new fields
        status: data.status || 'live',
        loadType: data.loadType || data.cargo || 'general-freight',
        driverCompensation: data.driverCompensation || data.price || 0,
        cdlClassRequired: data.cdlClassRequired || [],
        endorsementsRequired: data.endorsementsRequired || [],
      };
    });

    // Sort by createdAt descending
    loads.sort((a: any, b: any) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

    return handleApiSuccess(loads);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage === 'Unauthorized' || errorMessage === 'Invalid authentication token') {
      return handleApiError('unauthorized', error instanceof Error ? error : new Error(errorMessage), { endpoint: 'GET /api/loads' });
    }
    return handleApiError('server', error instanceof Error ? error : new Error(errorMessage), { endpoint: 'GET /api/loads' });
  }
}

export const POST = withCors(handlePost);
export const GET = withCors(handleGet);
