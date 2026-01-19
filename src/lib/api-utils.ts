// TEMPORARY FILE - DO NOT USE
// This file was deleted but something still imports it
// TODO: Find and remove the import

import { NextResponse } from 'next/server';

export function handleError(error: any, message: string = 'An unexpected error occurred', status: number = 500) {
  throw new Error('handleError is deprecated - use handleApiError() from api-error-handler instead');
}
