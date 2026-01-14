
import { NextResponse } from 'next/server';

/**
 * Standardized error response handler for API routes.
 * ALWAYS returns valid JSON - never empty responses.
 * 
 * @param error The error object.
 * @param message A user-friendly message for the response.
 * @param status The HTTP status code for the response.
 * @returns A NextResponse object with guaranteed JSON body.
 */
export function handleError(error: any, message: string = 'An unexpected error occurred', status: number = 500) {
  // Log the detailed error for server-side debugging
  console.error(`[API ERROR] ${message}`, {
    errorMessage: error?.message || 'Unknown error',
    errorName: error?.name,
    stack: error?.stack,
    timestamp: new Date().toISOString(),
  });

  // CRITICAL: Always return valid JSON, never empty body
  try {
    // For certain critical configuration errors, provide a more specific message
    if (error?.message?.includes('environment variables')) {
      return NextResponse.json(
        { 
          error: 'Server configuration error. Please contact support.',
          details: 'Missing required environment variables',
          timestamp: new Date().toISOString(),
        }, 
        { status: 500 }
      );
    }

    // Return a standardized, user-friendly error response
    return NextResponse.json(
      { 
        error: message,
        timestamp: new Date().toISOString(),
      }, 
      { status }
    );
  } catch (jsonError) {
    // Ultimate fallback if even JSON.stringify fails
    console.error('[CRITICAL] Failed to create error response:', jsonError);
    return new NextResponse(
      JSON.stringify({ error: 'Internal server error', timestamp: new Date().toISOString() }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
