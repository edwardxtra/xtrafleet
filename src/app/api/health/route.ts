import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase-admin-singleton';
import { handleApiSuccess } from '@/lib/api-error-handler';
import { withCors } from '@/lib/api-cors';

async function handleGet(request: NextRequest) {
  try {
    // Check Firebase Admin initialization
    const { auth, db } = await getFirebaseAdmin();
    
    const checks = {
      firebase_admin: !!auth && !!db,
      timestamp: new Date().toISOString(),
    };

    return handleApiSuccess({
      status: 'healthy',
      checks,
    });
  } catch (error) {
    return NextResponse.json({
      status: 'unhealthy',
      error: 'Firebase Admin initialization failed',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

// Export with CORS protection
export const GET = withCors(handleGet);
