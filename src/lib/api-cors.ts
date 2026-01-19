/**
 * CORS and security middleware for API routes
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * Allowed origins for API requests
 * 
 * Only these domains can make requests to your API endpoints.
 * This prevents other websites from calling your APIs.
 */
const ALLOWED_ORIGINS = [
  'https://xtrafleet.com',
  'https://www.xtrafleet.com',
  'https://xtrafleet-prd--studio-5112915880-e9ca2.us-central1.hosted.app',
  // Add localhost for development
  ...(process.env.NODE_ENV === 'development' ? [
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ] : [])
];

/**
 * Check if origin is allowed
 */
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true; // Same-origin requests have no origin header
  return ALLOWED_ORIGINS.includes(origin);
}

/**
 * Add CORS headers to response
 */
export function addCorsHeaders(response: NextResponse, request: NextRequest): NextResponse {
  const origin = request.headers.get('origin');
  
  if (origin && isAllowedOrigin(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
  }
  
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.headers.set('Access-Control-Max-Age', '86400'); // 24 hours
  
  return response;
}

/**
 * Check if request origin is allowed
 * Returns error response if not allowed
 */
export function checkOrigin(request: NextRequest): NextResponse | null {
  const origin = request.headers.get('origin');
  
  // No origin header = same-origin request (allowed)
  if (!origin) return null;
  
  // Check if origin is in allowed list
  if (!isAllowedOrigin(origin)) {
    console.warn(`[CORS] Blocked request from unauthorized origin: ${origin}`);
    return NextResponse.json(
      { error: 'Unauthorized origin' },
      { status: 403 }
    );
  }
  
  return null;
}

/**
 * Handle OPTIONS preflight requests
 */
export function handleOptions(request: NextRequest): NextResponse {
  const response = new NextResponse(null, { status: 204 });
  return addCorsHeaders(response, request);
}

/**
 * Wrapper for API routes with CORS protection
 * 
 * Usage:
 * ```typescript
 * export const GET = withCors(async (request: NextRequest) => {
 *   // Your handler logic
 *   return NextResponse.json({ data: 'something' });
 * });
 * ```
 */
export function withCors(
  handler: (request: NextRequest) => Promise<NextResponse>
) {
  return async (request: NextRequest) => {
    // Handle OPTIONS preflight
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }
    
    // Check origin
    const originError = checkOrigin(request);
    if (originError) return originError;
    
    // Call the actual handler
    const response = await handler(request);
    
    // Add CORS headers to response
    return addCorsHeaders(response, request);
  };
}
