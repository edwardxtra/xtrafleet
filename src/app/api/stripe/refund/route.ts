import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { authenticateRequest } from '@/lib/api-auth';
import {
  hasPermission,
  getDefaultRoleForLegacyAdmin,
  type AdminRole,
} from '@/lib/admin-roles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Dynamic imports to prevent build-time initialization
    const { stripe } = await import('@/lib/stripe');
    const { getAdminDb } = await import('@/lib/firebase-admin');
    const adminDb = await getAdminDb();

    // 1. Authenticate the caller (same-origin cookie auth, matches the admin UI).
    let caller;
    try {
      caller = await authenticateRequest(request);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Authorize: caller must be an admin with the billing:refund permission.
    const callerDoc = await adminDb.collection('owner_operators').doc(caller.uid).get();
    const callerData = callerDoc.data();
    const callerRole: AdminRole | undefined = callerData?.isAdmin
      ? ((callerData.adminRole as AdminRole) || getDefaultRoleForLegacyAdmin())
      : undefined;

    if (!callerRole || !hasPermission(callerRole, 'billing:refund')) {
      return NextResponse.json(
        { error: 'Access denied. Billing refund permission required.' },
        { status: 403 }
      );
    }

    const { paymentId, reason, details, ownerOperatorId } = await request.json();

    if (!paymentId || !reason || !details || !ownerOperatorId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Fetch the payment from Firestore
    const paymentDoc = await adminDb.collection('payments').doc(paymentId).get();

    if (!paymentDoc.exists) {
      return NextResponse.json(
        { error: 'Payment not found' },
        { status: 404 }
      );
    }

    const paymentData = paymentDoc.data();

    // 3. Consistency check: the payment must actually belong to the owner the
    // caller claims to be refunding. Prevents a malformed/forged request from
    // refunding one owner's payment while attributing it to another.
    if (paymentData?.ownerOperatorId !== ownerOperatorId) {
      return NextResponse.json(
        { error: 'Payment does not belong to the specified owner operator' },
        { status: 400 }
      );
    }

    // 4. Idempotency: never refund a payment that is already refunded.
    if (paymentData?.status === 'refunded') {
      return NextResponse.json(
        { error: 'Payment has already been refunded' },
        { status: 409 }
      );
    }

    if (!paymentData?.stripePaymentIntentId) {
      return NextResponse.json(
        { error: 'No Stripe payment intent found for this payment' },
        { status: 400 }
      );
    }

    // Create refund in Stripe
    const refund = await stripe.refunds.create({
      payment_intent: paymentData.stripePaymentIntentId,
      reason: 'requested_by_customer',
      metadata: {
        refund_reason: reason,
        refund_details: details,
        owner_operator_id: ownerOperatorId,
        admin_refund: 'true',
        refunded_by: caller.uid,
      },
    });

    // Update payment status in Firestore
    await adminDb.collection('payments').doc(paymentId).update({
      status: 'refunded',
      refundedAt: FieldValue.serverTimestamp(),
      refundReason: reason,
      refundDetails: details,
      stripeRefundId: refund.id,
      refundedBy: caller.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Create audit log entry
    await adminDb.collection('audit_logs').add({
      action: 'refund_processed',
      entityType: 'payment',
      entityId: paymentId,
      performedBy: caller.uid,
      performedByEmail: caller.email ?? null,
      ownerOperatorId,
      metadata: {
        amount: paymentData.amount,
        reason,
        details,
        stripeRefundId: refund.id,
      },
      timestamp: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      refundId: refund.id,
      amount: refund.amount,
    });
  } catch (error) {
    console.error('Error processing refund:', error);
    return NextResponse.json(
      { error: 'Failed to process refund' },
      { status: 500 }
    );
  }
}
