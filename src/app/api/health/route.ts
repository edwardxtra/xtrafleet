/**
 * Health Check Endpoint
 * 
 * Use this endpoint to verify system health before and after deployments.
 * 
 * GET /api/health
 * 
 * Returns:
 * - 200: All systems operational
 * - 500: One or more systems failing
 */

import { NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase-admin-singleton';

export const dynamic = 'force-dynamic';

interface HealthCheck {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  checks: {
    firebase: boolean;
    firestore: boolean;
    auth: boolean;
    environment: boolean;
  };
  error?: string;
}

export async function GET() {
  const startTime = Date.now();
  
  const healthCheck: HealthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || 'unknown',
    checks: {
      firebase: false,
      firestore: false,
      auth: false,
      environment: false,
    },
  };

  try {
    // Check environment variables
    const hasRequiredEnvVars = !!(  
      process.env.FB_PROJECT_ID &&
      process.env.FB_CLIENT_EMAIL &&
      process.env.FB_PRIVATE_KEY &&
      process.env.NEXT_PUBLIC_APP_URL
    );
    healthCheck.checks.environment = hasRequiredEnvVars;

    if (!hasRequiredEnvVars) {
      throw new Error('Missing required environment variables');
    }

    // Test Firebase Admin initialization
    const { auth, firestore } = await getFirebaseAdmin();
    healthCheck.checks.firebase = true;

    // Test Firestore read access
    try {
      await firestore.collection('owner_operators').limit(1).get();
      healthCheck.checks.firestore = true;
    } catch (error) {
      console.error('[Health Check] Firestore test failed:', error);
      healthCheck.checks.firestore = false;
    }

    // Test Auth service
    try {
      await auth.listUsers(1);
      healthCheck.checks.auth = true;
    } catch (error) {
      console.error('[Health Check] Auth test failed:', error);
      healthCheck.checks.auth = false;
    }

    // Determine overall health status
    const allChecksPass = Object.values(healthCheck.checks).every(check => check === true);
    const someChecksFail = Object.values(healthCheck.checks).some(check => check === false);
    
    if (allChecksPass) {
      healthCheck.status = 'healthy';
    } else if (someChecksFail && healthCheck.checks.firebase) {
      healthCheck.status = 'degraded';
    } else {
      healthCheck.status = 'unhealthy';
    }

    const responseTime = Date.now() - startTime;
    console.log(`[Health Check] Status: ${healthCheck.status} (${responseTime}ms)`, healthCheck.checks);

    return NextResponse.json(
      healthCheck,
      { 
        status: healthCheck.status === 'healthy' ? 200 : 500,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      }
    );

  } catch (error: any) {
    healthCheck.status = 'unhealthy';
    healthCheck.error = error.message;

    console.error('[Health Check] Failed:', error);

    return NextResponse.json(
      healthCheck,
      { 
        status: 500,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      }
    );
  }
}
