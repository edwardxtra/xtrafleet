import { NextRequest } from 'next/server';
import { getFirebaseAdmin, FieldValue } from '@/lib/firebase-admin-singleton';
import { handleApiError, handleApiSuccess } from '@/lib/api-error-handler';
import { withCors } from '@/lib/api-cors';

const LOG_PREFIX = '[geocode]';

const RADAR_SECRET_KEY = process.env.RADAR_SECRET_KEY;

// Cache TTL — 30 days. Coordinates for a given city / address don't change
// meaningfully; if Radar is ever asked twice for the same string within 30
// days we serve the cached answer.
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Negative-result TTL — 7 days. If Radar returns no match we still want to
// avoid spamming the upstream, but we re-try sooner than positive hits since
// the string could be a typo the user corrects.
const NEGATIVE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CachedGeocode {
  lat: number | null;
  lng: number | null;
  cachedAt: string; // ISO
  source: 'radar' | 'negative';
}

function normalizeKey(location: string): string {
  return location.toLowerCase().trim().replace(/\s+/g, ' ');
}

// Firestore doc IDs can't contain '/' so swap it for ' '. Otherwise the
// normalized key is safe (lowercase letters, digits, commas, spaces).
function toCacheId(normalized: string): string {
  return normalized.replace(/[/\\.#$\[\]]/g, '_').slice(0, 1500);
}

async function callRadar(query: string): Promise<{ lat: number; lng: number } | null> {
  if (!RADAR_SECRET_KEY) {
    console.warn(`${LOG_PREFIX} RADAR_SECRET_KEY is not set — geocode disabled`);
    return null;
  }
  try {
    const params = new URLSearchParams({ query });
    const res = await fetch(`https://api.radar.io/v1/geocode/forward?${params}`, {
      method: 'GET',
      headers: { Authorization: RADAR_SECRET_KEY },
    });
    if (!res.ok) {
      console.warn(`${LOG_PREFIX} Radar non-OK: ${res.status} for "${query}"`);
      return null;
    }
    const data = await res.json();
    const addr = data?.addresses?.[0];
    if (!addr) return null;
    const lat = typeof addr.latitude === 'number' ? addr.latitude : null;
    const lng = typeof addr.longitude === 'number' ? addr.longitude : null;
    if (lat == null || lng == null) return null;
    return { lat, lng };
  } catch (err) {
    console.warn(`${LOG_PREFIX} Radar threw for "${query}":`, err);
    return null;
  }
}

async function handleGet(req: NextRequest) {
  try {
    const { db } = await getFirebaseAdmin();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q');
    if (!q || !q.trim()) {
      throw new Error('Missing q parameter');
    }
    const normalized = normalizeKey(q);
    if (!normalized) throw new Error('Empty location after normalization');

    const cacheRef = db.collection('geocode_cache').doc(toCacheId(normalized));
    const snap = await cacheRef.get();
    if (snap.exists) {
      const cached = snap.data() as CachedGeocode | undefined;
      const cachedAt = cached?.cachedAt ? new Date(cached.cachedAt).getTime() : 0;
      const age = Date.now() - cachedAt;
      const ttl = cached?.source === 'negative' ? NEGATIVE_CACHE_TTL_MS : CACHE_TTL_MS;
      if (age < ttl) {
        if (cached?.lat != null && cached?.lng != null) {
          return handleApiSuccess({ lat: cached.lat, lng: cached.lng, source: 'cache' });
        }
        return handleApiSuccess({ lat: null, lng: null, source: 'cache-negative' });
      }
    }

    // Cache miss or stale — call Radar.
    const result = await callRadar(normalized);

    const toStore: CachedGeocode = result
      ? { lat: result.lat, lng: result.lng, cachedAt: new Date().toISOString(), source: 'radar' }
      : { lat: null, lng: null, cachedAt: new Date().toISOString(), source: 'negative' };

    await cacheRef.set({ ...toStore, query: normalized, updatedAt: FieldValue.serverTimestamp() });

    if (result) {
      return handleApiSuccess({ lat: result.lat, lng: result.lng, source: 'radar' });
    }
    return handleApiSuccess({ lat: null, lng: null, source: 'radar-negative' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === 'Missing q parameter' || msg === 'Empty location after normalization') {
      return handleApiError('missingFields', error instanceof Error ? error : new Error(msg), {
        endpoint: 'GET /api/geocode',
      });
    }
    return handleApiError('server', error instanceof Error ? error : new Error(msg), {
      endpoint: 'GET /api/geocode',
    });
  }
}

export const GET = withCors(handleGet);
