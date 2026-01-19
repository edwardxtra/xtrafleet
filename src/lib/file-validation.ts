// Shared file upload validation utilities

/**
 * Allowed file types for document uploads.
 * 
 * Includes:
 * - PDF: Official documents
 * - JPEG/JPG: Phone photos of documents
 * - PNG: Screenshots/scans
 * - WEBP: Modern compressed format
 */
export const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp'
] as const;

/**
 * Maximum file size: 10MB
 * Generous enough for high-quality phone photos
 */
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a file before upload.
 * 
 * Checks:
 * 1. File size (max 10MB)
 * 2. File type (PDF or images only)
 * 
 * @param file - The File object to validate
 * @returns Validation result with error message if invalid
 */
export function validateFile(file: File): FileValidationResult {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    const maxSizeMB = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(0);
    return {
      valid: false,
      error: `File is too large. Maximum size is ${maxSizeMB}MB. Current size: ${(file.size / (1024 * 1024)).toFixed(1)}MB`
    };
  }

  // Check file type
  if (!ALLOWED_FILE_TYPES.includes(file.type as any)) {
    return {
      valid: false,
      error: `Invalid file type "${file.type}". Only PDF, JPG, PNG, and WEBP files are allowed.`
    };
  }

  return { valid: true };
}

/**
 * Get human-readable label for file type
 */
export function getFileTypeLabel(mimeType: string): string {
  switch (mimeType) {
    case 'application/pdf':
      return 'PDF';
    case 'image/jpeg':
    case 'image/jpg':
      return 'JPG';
    case 'image/png':
      return 'PNG';
    case 'image/webp':
      return 'WEBP';
    default:
      return 'Unknown';
  }
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
