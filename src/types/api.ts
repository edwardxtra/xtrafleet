/**
 * API Response Types
 * 
 * Use these types for ALL API route responses to ensure type safety
 * and consistent error handling across the application.
 */

/**
 * Successful API response
 */
export type ApiSuccess<T = any> = {
  success: true;
  data: T;
  message?: string;
};

/**
 * Error API response
 */
export type ApiError = {
  success: false;
  error: string;
  code?: string;
  fieldErrors?: Record<string, string[]>;
  timestamp?: string;
};

/**
 * Generic API response (either success or error)
 */
export type ApiResponse<T = any> = ApiSuccess<T> | ApiError;

/**
 * Common API error codes for consistent error handling
 */
export enum ApiErrorCode {
  // Authentication errors
  UNAUTHORIZED = 'UNAUTHORIZED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  
  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  MISSING_FIELDS = 'MISSING_FIELDS',
  
  // Resource errors
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  CONFLICT = 'CONFLICT',
  
  // Server errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  
  // Rate limiting
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
}

/**
 * Type guard to check if response is an error
 */
export function isApiError(response: ApiResponse): response is ApiError {
  return !response.success;
}

/**
 * Type guard to check if response is successful
 */
export function isApiSuccess<T>(response: ApiResponse<T>): response is ApiSuccess<T> {
  return response.success === true;
}
