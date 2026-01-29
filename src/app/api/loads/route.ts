import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getFirebaseAdmin } from '@/lib/firebase-admin-singleton';
import { handleApiError, handleApiSuccess } from '@/lib/api-error-handler';
import { withCors } from '@/lib/api-cors';
import { rateLimiters, getIdentifier, formatTimeRemaining } from '@/lib/rate-limit';
import type { RouteInfo } from '@/lib/data';

const RADAR_SECRET_KEY = process.env.RADAR_SECRET_KEY;

/**
 * Geocode address to get coordinates using Radar API
 */
async function geocodeAddress(address: string): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const params = new URLSearchParams({ query: address });
    const response = await fetch(`https://api.radar.io/v1/geocode/forward?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': RADAR_SECRET_KEY!,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Loads] Geocoding error:', errorText);
      return null;
    }

    const data = await response.json();
    
    if (data.addresses && data.addresses.length > 0) {
      const { latitude, longitude } = data.addresses[0];
      return { latitude, longitude };
    }

    return null;
  } catch (error) {
    console.error('[Loads] Geocoding failed:', error);
    return null;
  }
}

/**
 * Calculate truck route using Radar API
 */
async function calculateRoute(origin: string, destination: string): Promise<RouteInfo | null> {
  if (!RADAR_SECRET_KEY) {
    console.warn('[Loads] RADAR_SECRET_KEY not configured, skipping route calculation');
    return null;
  }

  try {
    // Geocode origin and destination first
    const [originCoords, destCoords] = await Promise.all([
      geocodeAddress(origin),
      geocodeAddress(destination),
    ]);

    if (!originCoords || !destCoords) {
      console.warn('[Loads] Could not geocode addresses:', { origin: !!originCoords, destination: !!destCoords });
      return null;
    }

    // Use coordinates for route calculation
    const params = new URLSearchParams({
      origin: `${originCoords.latitude},${originCoords.longitude}`,
      destination: `${destCoords.latitude},${destCoords.longitude}`,
      modes: 'truck',
      units: 'imperial',
    });

    const response = await fetch(`https://api.radar.io/v1/route/distance?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': RADAR_SECRET_KEY,
      },
    });

    if (!response.ok) {
      console.error('[Loads] Radar API error:', await response.text());
      return null;
    }

    const data = await response.json();
    console.log('[Loads] Radar response:', JSON.stringify(data));

    // Radar returns routes as an object with 'truck' and 'geodesic' keys, not an array
    if (data.meta?.code !== 200 || !data.routes?.truck) {
      console.warn('[Loads] No truck route found for:', origin, '→', destination, 'Response:', JSON.stringify(data.meta));
      return null;
    }

    const route = data.routes.truck;
    const distanceMiles = Math.round(route.distance.value / 1609.34);

    return {
      distanceMiles,
      distanceText: `${distanceMiles} mi`,
      durationSeconds: route.duration.value,
      durationText: route.duration.text || formatDuration(route.duration.value),
      calculatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[Loads] Route calculation failed:', error);
    return null;
  }
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
  price: z.number().positive('Price must be a positive number'),
  pickupDate: z.string().min(1, 'Pickup date is required'),
  cargo: z.string().min(1, 'Cargo type is required'),
  weight: z.number().positive('Weight must be a positive number'),
  additionalDetails: z.string().optional().default(''),
  status: z.enum(['Pending', 'In-transit', 'Delivered']).default('Pending'),
  requiredQualifications: z.array(z.string()).default([]),
  // Standardized trailer type for matching
  trailerType: z.string().optional(),
  requiredTrailerType: z.string().optional(), // Legacy field name from form
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

    // Apply rate limiting AFTER auth (with user ID)
    const identifier = getIdentifier(req, decodedToken.uid);
    const { success, reset } = await rateLimiters.loads.limit(identifier);

    if (!success) {
      return NextResponse.json(
        {
          error: 'Too many load creation requests',
          message: `You can create more loads in ${formatTimeRemaining(reset)}`,
        },
        { status: 429 }
      );
    }

    // Parse and validate request body
    const body = await req.json();
    const validation = loadSchema.safeParse(body);

    if (!validation.success) {
      const errorMessage = Object.values(validation.error.flatten().fieldErrors).flat().join(', ');
      throw new Error(errorMessage);
    }

    // Normalize trailerType field (form sends as requiredTrailerType)
    const { requiredTrailerType, ...restData } = validation.data;
    const trailerType = validation.data.trailerType || requiredTrailerType;

    // Calculate truck route
    console.log('[Loads] Calculating route:', restData.origin, '→', restData.destination);
    const route = await calculateRoute(restData.origin, restData.destination);

    const newLoadData = {
      ...restData,
      trailerType,
      ownerOperatorId: decodedToken.uid,
      createdAt: new Date().toISOString(),
      ...(route && { route }), // Only include if route calculation succeeded
    };

    console.log('[Loads] Creating load for user:', decodedToken.uid, route ? `(${route.distanceText})` : '(no route)');
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
