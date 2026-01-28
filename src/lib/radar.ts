/**
 * Radar API utility for calculating truck routing distances
 * https://radar.com/documentation/api#distance
 */

interface RadarDistanceResponse {
  meta: {
    code: number;
  };
  routes: {
    distance: {
      value: number; // meters
      text: string;
    };
    duration: {
      value: number; // seconds
      text: string;
    };
    geometry?: {
      polyline: string;
    };
  }[];
}

interface DistanceResult {
  distanceMiles: number;
  durationMinutes: number;
}

/**
 * Calculate truck routing distance between two locations using Radar API
 * Returns distance in miles and duration in minutes
 */
export async function calculateTruckDistance(
  origin: string,
  destination: string
): Promise<DistanceResult | null> {
  const apiKey = process.env.RADAR_SECRET_KEY;

  if (!apiKey) {
    console.warn('[Radar] RADAR_SECRET_KEY not configured, skipping distance calculation');
    return null;
  }

  try {
    // First, geocode both locations
    const [originCoords, destCoords] = await Promise.all([
      geocodeLocation(origin, apiKey),
      geocodeLocation(destination, apiKey),
    ]);

    if (!originCoords || !destCoords) {
      console.warn('[Radar] Could not geocode locations:', { origin, destination });
      return null;
    }

    // Calculate route distance using Radar Distance API
    const params = new URLSearchParams({
      origin: `${originCoords.lat},${originCoords.lng}`,
      destination: `${destCoords.lat},${destCoords.lng}`,
      modes: 'truck',
      units: 'imperial',
    });

    const response = await fetch(
      `https://api.radar.io/v1/route/distance?${params}`,
      {
        headers: {
          Authorization: apiKey,
        },
      }
    );

    if (!response.ok) {
      console.error('[Radar] Distance API error:', response.status, await response.text());
      return null;
    }

    const data: RadarDistanceResponse = await response.json();

    if (data.meta.code !== 200 || !data.routes?.[0]) {
      console.warn('[Radar] No route found:', data);
      return null;
    }

    const route = data.routes[0];

    // Convert meters to miles (1 mile = 1609.344 meters)
    const distanceMiles = Math.round(route.distance.value / 1609.344);
    const durationMinutes = Math.round(route.duration.value / 60);

    console.log('[Radar] Distance calculated:', {
      origin,
      destination,
      distanceMiles,
      durationMinutes,
    });

    return {
      distanceMiles,
      durationMinutes,
    };
  } catch (error) {
    console.error('[Radar] Error calculating distance:', error);
    return null;
  }
}

interface GeocodeResult {
  lat: number;
  lng: number;
}

interface RadarGeocodeResponse {
  meta: {
    code: number;
  };
  addresses: {
    latitude: number;
    longitude: number;
    formattedAddress: string;
  }[];
}

/**
 * Geocode a location string to coordinates using Radar API
 */
async function geocodeLocation(
  location: string,
  apiKey: string
): Promise<GeocodeResult | null> {
  try {
    const params = new URLSearchParams({
      query: location + ', USA',
    });

    const response = await fetch(
      `https://api.radar.io/v1/geocode/forward?${params}`,
      {
        headers: {
          Authorization: apiKey,
        },
      }
    );

    if (!response.ok) {
      console.error('[Radar] Geocode API error:', response.status);
      return null;
    }

    const data: RadarGeocodeResponse = await response.json();

    if (data.meta.code !== 200 || !data.addresses?.[0]) {
      console.warn('[Radar] No geocode result for:', location);
      return null;
    }

    return {
      lat: data.addresses[0].latitude,
      lng: data.addresses[0].longitude,
    };
  } catch (error) {
    console.error('[Radar] Geocode error:', error);
    return null;
  }
}
