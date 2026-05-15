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
  // Production domains
  'https://xtrafleet.com',
  'https://www.xtrafleet.com',
  'https://xtrafleet-prd--studio-5112915880-e9ca2.us-central1.hosted.app',
  // QA domain
  'https://xtrafleet-qa--xtrafleet-qa.us-central1.hosted.app',
  // Add localhost for development
  ...(process.env.NODE_ENV === 'development' ? [
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ] : [])
];

/**
 * Check if origin is allowed for THIS request.
 *
 * Two paths:
 *   1. Same-origin (the Origin header's host matches the request's own
 *      host). Modern browsers send `Origin` on same-origin POST/DELETE
 *      requests, so we must allow it explicitly — the request comes
 *      from our own page and is never a cross-site attack.
 *   2. Cross-origin: must be in the explicit ALLOWED_ORIGINS list.
 */
function isOriginAllowed(origin: string | null, request: NextRequest): boolean {
  if (!origin) return true; // No Origin header → same-origin GET/HEAD
  const host = request.headers.get('host');
  if (host) {
    try {
      if (new URL(origin).host === host) return true;
    } catch {
      // Malformed Origin header — fall through to allowlist check.
    }
  }
  return ALLOWED_ORIGINS.includes(origin);
}

/**
 * Add CORS headers to response
 */
export function addCorsHeaders(response: NextResponse, request: NextRequest): NextResponse {
  const origin = request.headers.get('origin');

  if (origin && isOriginAllowed(origin, request)) {
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

  // Check if origin is in allowed list (same-origin or explicit allowlist)
  if (!isOriginAllowed(origin, request)) {
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
