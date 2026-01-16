import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { adminDb } from '@/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
});

export async function POST(request: NextRequest) {
  try {
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
      },
    });

    // Update payment status in Firestore
    await adminDb.collection('payments').doc(paymentId).update({
      status: 'refunded',
      refundedAt: FieldValue.serverTimestamp(),
      refundReason: reason,
      refundDetails: details,
      stripeRefundId: refund.id,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Create audit log entry
    await adminDb.collection('audit_logs').add({
      action: 'refund_processed',
      entityType: 'payment',
      entityId: paymentId,
      performedBy: 'admin', // TODO: Get actual admin user ID from session
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
