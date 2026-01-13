import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { adminDb } from '@/lib/firebase-admin';
import Stripe from 'stripe';

// This is required for webhooks to work in Next.js App Router
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  // Skip webhook verification if secret is not set (for testing)
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.warn('STRIPE_WEBHOOK_SECRET not set, skipping webhook verification');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  console.log('Checkout session completed:', session.id);

  const metadata = session.metadata;
  
  // Handle match fee payment
  if (metadata?.type === 'match_fee') {
    const { tlaId, matchId, loadOwnerId } = metadata;
    
    if (tlaId && matchId && loadOwnerId) {
      // Update TLA with payment status
      await adminDb.collection('tlas').doc(tlaId).update({
        matchFeePaid: true,
        matchFeePaymentId: session.payment_intent,
        matchFeePaidAt: new Date().toISOString(),
        matchFeePaidBy: loadOwnerId,
      });

      // Update match with payment status
      await adminDb.collection('matches').doc(matchId).update({
        matchFeePaid: true,
        matchFeePaymentId: session.payment_intent,
        matchFeePaidAt: new Date().toISOString(),
      });

      console.log(`Match fee paid for TLA ${tlaId}`);
    }
  }

  // Handle subscription checkout
  if (session.mode === 'subscription' && session.subscription) {
    const userId = metadata?.userId;
    if (userId) {
      await adminDb.collection('owner_operators').doc(userId).update({
        stripeSubscriptionId: session.subscription,
        subscriptionStatus: 'trialing',
        updatedAt: new Date().toISOString(),
      });

      console.log(`Subscription created for user ${userId}`);
    }
  }
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  console.log('Subscription updated:', subscription.id);

  const userId = subscription.metadata?.userId;
  if (!userId) {
    console.warn('No userId in subscription metadata');
    return;
  }

  const updateData: any = {
    subscriptionStatus: subscription.status,
    subscriptionPlanType: subscription.metadata?.planType || 'monthly',
    updatedAt: new Date().toISOString(),
  };

  // Store trial end date if in trial
  if (subscription.status === 'trialing' && subscription.trial_end) {
    updateData.trialEndsAt = new Date(subscription.trial_end * 1000).toISOString();
  }

  // Store current period end
  if (subscription.current_period_end) {
    updateData.subscriptionPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString();
  }

  await adminDb.collection('owner_operators').doc(userId).update(updateData);

  console.log(`Subscription updated for user ${userId}, status: ${subscription.status}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  console.log('Subscription deleted:', subscription.id);

  const userId = subscription.metadata?.userId;
  if (!userId) {
    console.warn('No userId in subscription metadata');
    return;
  }

  await adminDb.collection('owner_operators').doc(userId).update({
    subscriptionStatus: 'canceled',
    subscriptionCanceledAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  console.log(`Subscription canceled for user ${userId}`);
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  console.log('Invoice payment succeeded:', invoice.id);

  const customerId = invoice.customer as string;
  if (!customerId) return;

  // Find user by Stripe customer ID
  const usersSnapshot = await adminDb
    .collection('owner_operators')
    .where('stripeCustomerId', '==', customerId)
    .limit(1)
    .get();

  if (usersSnapshot.empty) {
    console.warn('No user found for customer:', customerId);
    return;
  }

  const userId = usersSnapshot.docs[0].id;

  // Store invoice in transaction history
  await adminDb.collection('owner_operators').doc(userId).collection('transactions').add({
    type: 'subscription_payment',
    stripeInvoiceId: invoice.id,
    amount: invoice.amount_paid / 100, // Convert cents to dollars
    currency: invoice.currency,
    status: 'succeeded',
    invoiceUrl: invoice.hosted_invoice_url,
    paidAt: new Date(invoice.created * 1000).toISOString(),
    createdAt: new Date().toISOString(),
  });

  console.log(`Invoice payment recorded for user ${userId}`);
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  console.log('Invoice payment failed:', invoice.id);

  const customerId = invoice.customer as string;
  if (!customerId) return;

  // Find user by Stripe customer ID
  const usersSnapshot = await adminDb
    .collection('owner_operators')
    .where('stripeCustomerId', '==', customerId)
    .limit(1)
    .get();

  if (usersSnapshot.empty) {
    console.warn('No user found for customer:', customerId);
    return;
  }

  const userId = usersSnapshot.docs[0].id;

  // Update subscription status
  await adminDb.collection('owner_operators').doc(userId).update({
    subscriptionStatus: 'past_due',
    lastPaymentFailed: true,
    lastPaymentFailedAt: new Date().toISOString(),
  });

  // Store failed payment in transaction history
  await adminDb.collection('owner_operators').doc(userId).collection('transactions').add({
    type: 'subscription_payment',
    stripeInvoiceId: invoice.id,
    amount: invoice.amount_due / 100,
    currency: invoice.currency,
    status: 'failed',
    failureReason: 'Payment failed',
    createdAt: new Date().toISOString(),
  });

  console.log(`Payment failure recorded for user ${userId}`);
}

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  console.log('Payment intent succeeded:', paymentIntent.id);

  // This handles one-time payments like match fees
  const metadata = paymentIntent.metadata;
  
  if (metadata?.type === 'match_fee' && metadata?.tlaId) {
    // Already handled in checkout.session.completed
    // This is a backup in case checkout event was missed
    console.log('Match fee payment confirmed:', metadata.tlaId);
  }
}
