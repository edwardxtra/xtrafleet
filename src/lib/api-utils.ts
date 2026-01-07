
import { NextResponse } from 'next/server';

/**
 * Standardized error response handler for API routes.
 * Logs the full error to the console for debugging and returns a
 * user-friendly JSON response.
 *
 * @param error The error object.
 * @param message A user-friendly message for the response.
 * @param status The HTTP status code for the response.
 * @returns A NextResponse object.
 */
export function handleError(error: any, message: string = 'An unexpected error occurred', status: number = 500) {
  // Log the detailed error for server-side debugging
  console.error(`API Error: ${message}`, {
    errorMessage: error.message,
    stack: error.stack,
    // Add any other relevant context
  });

  // For certain critical configuration errors, provide a more specific message.
  if (error.message.includes("environment variables")) {
      return NextResponse.json({ error: 'Server configuration error. Please contact support.' }, { status: 500 });
  }

  // Return a standardized, user-friendly error response
  return NextResponse.json({ error: message }, { status });
}
