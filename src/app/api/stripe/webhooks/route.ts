import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Dynamic imports
    const { stripe } = await import('@/lib/stripe');
    const { getAdminDb } = await import('@/lib/firebase-admin');
    
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ error: 'No signature' }, { status: 400 });
    }

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      console.warn('STRIPE_WEBHOOK_SECRET not set');
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const adminDb = getAdminDb();

    // Handle events
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const metadata = session.metadata;
        
        if (metadata?.type === 'match_fee' && metadata?.tlaId) {
          await adminDb.collection('tlas').doc(metadata.tlaId).update({
            matchFeePaid: true,
            matchFeePaymentId: session.payment_intent,
            matchFeePaidAt: new Date().toISOString(),
          });
        }
        
        if (session.mode === 'subscription' && metadata?.userId) {
          await adminDb.collection('owner_operators').doc(metadata.userId).update({
            stripeSubscriptionId: session.subscription,
            subscriptionStatus: 'trialing',
            updatedAt: new Date().toISOString(),
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const userId = subscription.metadata?.userId;
        
        if (userId) {
          const updateData: any = {
            subscriptionStatus: subscription.status,
            updatedAt: new Date().toISOString(),
          };
          
          if (subscription.trial_end) {
            updateData.trialEndsAt = new Date(subscription.trial_end * 1000).toISOString();
          }
          
          if (subscription.current_period_end) {
            updateData.subscriptionPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString();
          }
          
          await adminDb.collection('owner_operators').doc(userId).update(updateData);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const userId = subscription.metadata?.userId;
        
        if (userId) {
          await adminDb.collection('owner_operators').doc(userId).update({
            subscriptionStatus: 'canceled',
            updatedAt: new Date().toISOString(),
          });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer as string;
        
        if (customerId) {
          const usersSnapshot = await adminDb
            .collection('owner_operators')
            .where('stripeCustomerId', '==', customerId)
            .limit(1)
            .get();

          if (!usersSnapshot.empty) {
            const userId = usersSnapshot.docs[0].id;
            await adminDb.collection('owner_operators').doc(userId).update({
              subscriptionStatus: 'past_due',
              lastPaymentFailed: true,
              lastPaymentFailedAt: new Date().toISOString(),
            });
          }
        }
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
