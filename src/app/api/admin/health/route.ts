/**
 * Admin: system-health snapshot (DEV-166).
 *
 * Returns the configured-ness of each integration the admin console depends on
 * plus a recent-error indicator pulled from audit_logs. Admin-gated on
 * `audit:view` (broadest non-billing-only admin permission).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase-admin-singleton';
import { withCors } from '@/lib/api-cors';
import { hasPermission, getDefaultRoleForLegacyAdmin, type AdminRole } from '@/lib/admin-roles';

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status });
}

async function handleGet(request: NextRequest) {
  try {
    const { auth, db } = await getFirebaseAdmin();

    const tokenCookie = request.cookies.get('fb-id-token');
    if (!tokenCookie) return json({ error: 'You must be signed in.' }, 401);
    let decoded: { uid: string; email?: string };
    try {
      try {
        decoded = await auth.verifySessionCookie(tokenCookie.value, true);
      } catch {
        decoded = await auth.verifyIdToken(tokenCookie.value);
      }
    } catch {
      return json({ error: 'Your session is invalid. Please sign in again.' }, 401);
    }

    const adminSnap = await db.collection('owner_operators').doc(decoded.uid).get();
    const adminData = adminSnap.exists ? adminSnap.data() : null;
    if (!adminData?.isAdmin) {
      return json({ error: 'Admin access required.' }, 403);
    }
    const role: AdminRole = (adminData.adminRole as AdminRole) || getDefaultRoleForLegacyAdmin();
    if (!hasPermission(role, 'audit:view')) {
      return json({ error: 'You do not have permission to view system health.' }, 403);
    }

    const fmcsaConfigured = !!process.env.FMCSA_WEB_KEY;
    const resendConfigured = !!process.env.RESEND_API_KEY;
    const upstashConfigured = !!(
      process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    );
    const stripeConfigured = !!process.env.STRIPE_SECRET_KEY;

    // Recent compliance-gate blocks — useful canary for FMCSA outages.
    let recentBlockedMatches: number | null = null;
    try {
      const snap = await db
        .collection('audit_logs')
        .where('action', '==', 'match_formation_blocked')
        .limit(100)
        .get();
      recentBlockedMatches = snap.size;
    } catch {
      // Composite index may not exist; surface as null instead of failing the route.
      recentBlockedMatches = null;
    }

    return json(
      {
        firebaseAdmin: true,
        fmcsaConfigured,
        resendConfigured,
        upstashConfigured,
        stripeConfigured,
        recentBlockedMatches,
        appUrl: process.env.NEXT_PUBLIC_APP_URL || null,
        nodeEnv: process.env.NODE_ENV || null,
        checkedAt: new Date().toISOString(),
      },
      200
    );
  } catch (error: any) {
    console.error('[GET /api/admin/health]', error);
    return json({ error: 'Failed to load health snapshot.' }, 500);
  }
}

export const GET = withCors(handleGet);
