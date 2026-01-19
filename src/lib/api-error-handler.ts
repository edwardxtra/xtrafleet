/**
 * Centralized error handling for API routes
 * 
 * Provides safe error responses that don't leak implementation details
 */

import { NextResponse } from 'next/server';

/**
 * Generic error messages by category
 * Never expose internal error details to users
 */
const ERROR_MESSAGES = {
  // Authentication & Authorization
  auth: 'Authentication failed. Please log in again.',
  unauthorized: 'You do not have permission to perform this action.',
  
  // Validation
  validation: 'Invalid request. Please check your input and try again.',
  missingFields: 'Required fields are missing.',
  
  // Database
  notFound: 'The requested resource was not found.',
  conflict: 'This resource already exists.',
  
  // Generic
  server: 'An error occurred. Please try again later.',
  network: 'Network error. Please check your connection.',
};

/**
 * Error types for logging (internal use only)
 */
export type ApiErrorType = 
  | 'auth' 
  | 'unauthorized' 
  | 'validation' 
  | 'missingFields' 
  | 'notFound' 
  | 'conflict' 
  | 'server' 
  | 'network';

/**
 * Log error details server-side (not sent to client)
 */
function logError(context: {
  endpoint: string;
  error: Error;
  userId?: string;
  metadata?: Record<string, any>;
}) {
  console.error('[API Error]', {
    timestamp: new Date().toISOString(),
    endpoint: context.endpoint,
    userId: context.userId || 'unknown',
    errorMessage: context.error.message,
    errorStack: context.error.stack,
    ...context.metadata,
  });
}

/**
 * Create a safe error response
 * 
 * - Logs full error details server-side
 * - Returns generic message to client
 * - Includes request ID for support
 * 
 * @param type - Error type (determines user message)
 * @param error - Original error (for logging)
 * @param context - Additional context for logging
 */
export function handleApiError(
  type: ApiErrorType,
  error: Error,
  context: {
    endpoint: string;
    userId?: string;
    metadata?: Record<string, any>;
  }
): NextResponse {
  // Log full error details server-side
  logError({
    endpoint: context.endpoint,
    error,
    userId: context.userId,
    metadata: context.metadata,
  });
  
  // Determine status code
  const statusCode = getStatusCode(type);
  
  // Return generic error message to client
  return NextResponse.json(
    {
      error: ERROR_MESSAGES[type],
      // Never include: error.message, error.stack, or internal details
    },
    { status: statusCode }
  );
}

/**
 * Get HTTP status code for error type
 */
function getStatusCode(type: ApiErrorType): number {
  switch (type) {
    case 'auth':
      return 401;
    case 'unauthorized':
      return 403;
    case 'validation':
    case 'missingFields':
      return 400;
    case 'notFound':
      return 404;
    case 'conflict':
      return 409;
    case 'server':
    case 'network':
    default:
      return 500;
  }
}

/**
 * Safe success response helper
 */
export function handleApiSuccess<T>(data: T, status: number = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/**
 * Wrapper for API routes with error handling
 * 
 * Usage:
 * ```typescript
 * export const GET = withErrorHandler('GET /api/loads', async (request) => {
 *   const loads = await getLoads();
 *   return handleApiSuccess({ loads });
 * });
 * ```
 */
export function withErrorHandler(
  endpoint: string,
  handler: (request: Request) => Promise<NextResponse>
) {
  return async (request: Request) => {
    try {
      return await handler(request);
    } catch (error) {
      // Catch any unhandled errors
      return handleApiError(
        'server',
        error instanceof Error ? error : new Error(String(error)),
        { endpoint }
      );
    }
  };
}
