/**
 * Admin: process a Stripe refund.
 *
 * Authenticates the caller, requires `billing:refund`, calls the Stripe
 * Refunds API, flips the Payment doc to `refunded`, and writes an audit-log
 * entry with the real admin id (used to be hardcoded as 'admin').
 *
 * The previous implementation imported `adminDb` from `@/lib/firebase-admin`,
 * which only exports `getAdminDb()` — so this endpoint had never actually
 * worked (any call would crash on the first Firestore read). Fixed to use
 * the singleton + admin auth properly.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin, FieldValue } from '@/lib/firebase-admin-singleton';
import { withCors } from '@/lib/api-cors';
import { hasPermission, getDefaultRoleForLegacyAdmin, type AdminRole } from '@/lib/admin-roles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status });
}

async function handlePost(request: NextRequest) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return json({ error: 'Stripe is not configured.' }, 503);
    }

    const { auth, db } = await getFirebaseAdmin();

    // 1. Authenticate.
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
    const adminUid = decoded.uid;
    const adminEmail = decoded.email || '';

    // 2. Authorize.
    const adminSnap = await db.collection('owner_operators').doc(adminUid).get();
    const adminData = adminSnap.exists ? adminSnap.data() : null;
    if (!adminData?.isAdmin) {
      return json({ error: 'Admin access required.' }, 403);
    }
    const role: AdminRole = (adminData.adminRole as AdminRole) || getDefaultRoleForLegacyAdmin();
    if (!hasPermission(role, 'billing:refund')) {
      return json({ error: 'You do not have permission to process refunds.' }, 403);
    }

    // 3. Validate input.
    let body: { paymentId?: string; reason?: string; details?: string; ownerOperatorId?: string };
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid request body.' }, 400);
    }
    const { paymentId, reason, details, ownerOperatorId } = body;
    if (!paymentId || !reason || !details || !ownerOperatorId) {
      return json({ error: 'Missing required fields' }, 400);
    }

    // 4. Load the payment.
    const paymentDoc = await db.collection('payments').doc(paymentId).get();
    if (!paymentDoc.exists) {
      return json({ error: 'Payment not found' }, 404);
    }
    const paymentData = paymentDoc.data() as
      | { stripePaymentIntentId?: string; status?: string; amount?: number; matchId?: string; loadId?: string }
      | undefined;
    if (!paymentData?.stripePaymentIntentId) {
      return json({ error: 'No Stripe payment intent on this payment' }, 400);
    }
    if (paymentData.status === 'refunded') {
      return json({ error: 'This payment has already been refunded.' }, 409);
    }

    // 5. Process the refund.
    const Stripe = (await import('stripe')).default;
    // Use the SDK's default API version (avoids a TS apiVersion-mismatch error
    // and lets the installed SDK pick a compatible version for refunds).
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const refund = await stripe.refunds.create({
      payment_intent: paymentData.stripePaymentIntentId,
      reason: 'requested_by_customer',
      metadata: {
        refund_reason: reason,
        refund_details: details,
        owner_operator_id: ownerOperatorId,
        admin_refund: 'true',
        admin_id: adminUid,
      },
    });

    // 6. Mark the payment refunded.
    await db.collection('payments').doc(paymentId).update({
      status: 'refunded',
      refundedAt: FieldValue.serverTimestamp(),
      refundReason: reason,
      refundDetails: details,
      refundedBy: adminUid,
      stripeRefundId: refund.id,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 7. Audit log — real admin id, not the previously-hardcoded 'admin'.
    await db.collection('audit_logs').add({
      action: 'billing_refunded',
      adminId: adminUid,
      adminEmail,
      targetType: 'system',
      targetId: paymentId,
      targetName: `Payment ${paymentId}`,
      reason,
      details: {
        amount: paymentData.amount,
        refundDetails: details,
        stripeRefundId: refund.id,
        ownerOperatorId,
        matchId: paymentData.matchId,
        loadId: paymentData.loadId,
      },
      timestamp: FieldValue.serverTimestamp(),
      createdAt: new Date().toISOString(),
    });

    return json({ success: true, refundId: refund.id, amount: refund.amount }, 200);
  } catch (error: any) {
    console.error('[POST /api/stripe/refund]', error);
    return json({ error: error?.message || 'Failed to process refund' }, 500);
  }
}

export const POST = withCors(handlePost);
