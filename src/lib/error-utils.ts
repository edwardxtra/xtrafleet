// Error types for better categorization
export type ErrorType = 
  | 'network'
  | 'auth'
  | 'permission'
  | 'validation'
  | 'not-found'
  | 'storage'
  | 'unknown';

export interface AppError {
  type: ErrorType;
  message: string;
  originalError?: unknown;
}

// Map Firebase/common errors to user-friendly messages
export function parseError(error: unknown): AppError {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorCode = (error as { code?: string })?.code || '';

  // Network errors
  if (
    errorMessage.includes('network') ||
    errorMessage.includes('Failed to fetch') ||
    errorMessage.includes('Network request failed') ||
    errorCode === 'unavailable'
  ) {
    return {
      type: 'network',
      message: 'Unable to connect. Please check your internet connection and try again.',
      originalError: error,
    };
  }

  // Auth errors
  if (errorCode.startsWith('auth/')) {
    const authMessages: Record<string, string> = {
      'auth/user-not-found': 'No account found with this email address.',
      'auth/wrong-password': 'Incorrect password. Please try again.',
      'auth/email-already-in-use': 'An account with this email already exists.',
      'auth/weak-password': 'Password is too weak. Please use at least 6 characters.',
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
      'auth/expired-action-code': 'This link has expired. Please request a new one.',
      'auth/invalid-action-code': 'This link is invalid. Please request a new one.',
    };
    return {
      type: 'auth',
      message: authMessages[errorCode] || 'Authentication failed. Please try again.',
      originalError: error,
    };
  }

  // Permission errors
  if (
    errorCode === 'permission-denied' ||
    errorMessage.includes('permission') ||
    errorMessage.includes('Missing or insufficient permissions')
  ) {
    return {
      type: 'permission',
      message: 'You don\'t have permission to perform this action.',
      originalError: error,
    };
  }

  // Storage errors
  if (errorCode.startsWith('storage/')) {
    const storageMessages: Record<string, string> = {
      'storage/unauthorized': 'You don\'t have permission to upload files.',
      'storage/canceled': 'Upload was cancelled.',
      'storage/unknown': 'An error occurred while uploading. Please try again.',
      'storage/object-not-found': 'File not found.',
      'storage/quota-exceeded': 'Storage quota exceeded. Please contact support.',
      'storage/invalid-checksum': 'File upload failed. Please try again.',
      'storage/retry-limit-exceeded': 'Upload failed after multiple attempts. Please try again later.',
    };
    return {
      type: 'storage',
      message: storageMessages[errorCode] || 'File upload failed. Please try again.',
      originalError: error,
    };
  }

  // Not found errors
  if (
    errorCode === 'not-found' ||
    errorMessage.includes('not found') ||
    errorMessage.includes('does not exist')
  ) {
    return {
      type: 'not-found',
      message: 'The requested item could not be found.',
      originalError: error,
    };
  }

  // Validation errors
  if (
    errorMessage.includes('required') ||
    errorMessage.includes('invalid') ||
    errorMessage.includes('must be')
  ) {
    return {
      type: 'validation',
      message: errorMessage,
      originalError: error,
    };
  }

  // Default unknown error
  return {
    type: 'unknown',
    message: 'Something went wrong. Please try again.',
    originalError: error,
  };
}

// Form validation utilities
export interface ValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  custom?: (value: string) => string | null;
}

export interface ValidationRules {
  [field: string]: ValidationRule;
}

export interface ValidationErrors {
  [field: string]: string;
}

export function validateField(value: string, rules: ValidationRule): string | null {
  if (rules.required && (!value || value.trim() === '')) {
    return 'This field is required';
  }

  if (rules.minLength && value.length < rules.minLength) {
    return `Must be at least ${rules.minLength} characters`;
  }

  if (rules.maxLength && value.length > rules.maxLength) {
    return `Must be no more than ${rules.maxLength} characters`;
  }

  if (rules.pattern && !rules.pattern.test(value)) {
    return 'Invalid format';
  }

  if (rules.custom) {
    return rules.custom(value);
  }

  return null;
}

export function validateForm(
  data: Record<string, string>,
  rules: ValidationRules
): ValidationErrors {
  const errors: ValidationErrors = {};

  for (const [field, fieldRules] of Object.entries(rules)) {
    const error = validateField(data[field] || '', fieldRules);
    if (error) {
      errors[field] = error;
    }
  }

  return errors;
}

// Common validation patterns
export const patterns = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  phone: /^\+?[\d\s-()]{10,}$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
  url: /^https?:\/\/.+/,
};