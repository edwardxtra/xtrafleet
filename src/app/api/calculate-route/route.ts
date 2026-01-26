import { NextRequest, NextResponse } from 'next/server';
import { withCors } from '@/lib/api-cors';

const RADAR_SECRET_KEY = process.env.RADAR_SECRET_KEY;
const RADAR_API_URL = 'https://api.radar.io/v1/route/distance';

export interface RouteResult {
  distance: {
    value: number; // meters
    text: string;  // formatted (e.g., "245 mi")
  };
  duration: {
    value: number; // seconds
    text: string;  // formatted (e.g., "4 hr 15 min")
  };
  origin: {
    latitude: number;
    longitude: number;
  };
  destination: {
    latitude: number;
    longitude: number;
  };
}

interface RadarResponse {
  meta: {
    code: number;
  };
  routes: {
    distance: {
      value: number;
      text: string;
    };
    duration: {
      value: number;
      text: string;
    };
    geometry?: {
      coordinates: number[][];
    };
  }[];
  origin?: {
    latitude: number;
    longitude: number;
  };
  destination?: {
    latitude: number;
    longitude: number;
  };
}

function formatDistance(meters: number): string {
  const miles = meters / 1609.34;
  return `${Math.round(miles)} mi`;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);

  if (hours === 0) {
    return `${minutes} min`;
  } else if (minutes === 0) {
    return `${hours} hr`;
  }
  return `${hours} hr ${minutes} min`;
}

async function handlePost(request: NextRequest) {
  try {
    if (!RADAR_SECRET_KEY) {
      return NextResponse.json(
        { error: 'Radar API key not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { origin, destination } = body;

    if (!origin || !destination) {
      return NextResponse.json(
        { error: 'Origin and destination are required' },
        { status: 400 }
      );
    }

    // Call Radar API with truck routing mode
    const params = new URLSearchParams({
      origin: origin,
      destination: destination,
      modes: 'truck',
      units: 'imperial',
    });

    const response = await fetch(`${RADAR_API_URL}?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': RADAR_SECRET_KEY,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Radar API error:', errorText);
      return NextResponse.json(
        { error: 'Failed to calculate route', details: errorText },
        { status: response.status }
      );
    }

    const data: RadarResponse = await response.json();

    if (data.meta?.code !== 200 || !data.routes?.length) {
      return NextResponse.json(
        { error: 'Could not find route between locations' },
        { status: 404 }
      );
    }

    const route = data.routes[0];

    const result: RouteResult = {
      distance: {
        value: route.distance.value,
        text: route.distance.text || formatDistance(route.distance.value),
      },
      duration: {
        value: route.duration.value,
        text: route.duration.text || formatDuration(route.duration.value),
      },
      origin: data.origin || { latitude: 0, longitude: 0 },
      destination: data.destination || { latitude: 0, longitude: 0 },
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Route calculation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const POST = withCors(handlePost);
