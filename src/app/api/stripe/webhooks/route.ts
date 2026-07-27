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

    // DEV-84: getAdminDb is async — used to be called without `await`, which
    // meant `adminDb` was a Promise and every `adminDb.collection(...)` call
    // would throw at runtime. The webhook was effectively a no-op for every
    // event handler below. Fixing here.
    const adminDb = await getAdminDb();

    // Handle events
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const metadata = session.metadata;

        if (metadata?.type === 'match_fee' && metadata?.tlaId) {
          // DEV-84: complete the match-fee payment lifecycle.
          //
          // The session-completed handler used to ONLY flip the TLA flag and
          // never wrote to the `payments` collection — which meant the refund
          // route (DEV-165) and `/admin/billing` had no source of truth.
          // Now we also write a payments doc and an audit entry, with both
          // sides idempotent so Stripe's retries don't double-record.
          const paymentIntentId = String(session.payment_intent || '');
          const tlaId = metadata.tlaId;
          const matchId = metadata.matchId || '';
          const loadOwnerId = metadata.loadOwnerId || '';
          const nowIso = new Date().toISOString();

          // (1) Write the payments doc using the PaymentIntent id as the doc
          //     id — guarantees natural idempotency for Stripe retries.
          if (paymentIntentId) {
            const paymentRef = adminDb.collection('payments').doc(paymentIntentId);
            const existingPayment = await paymentRef.get();
            if (!existingPayment.exists) {
              await paymentRef.set({
                id: paymentIntentId,
                type: 'match_fee',
                amount: typeof session.amount_total === 'number'
                  ? session.amount_total
                  : 2500,
                currency: session.currency || 'usd',
                status: 'succeeded',
                tlaId,
                matchId,
                ownerOperatorId: loadOwnerId,
                stripeSessionId: session.id,
                stripePaymentIntentId: paymentIntentId,
                stripeCustomerId: session.customer || null,
                description: `Match fee for TLA ${tlaId}`,
                paidAt: nowIso,
                createdAt: nowIso,
              });
            }
          }

          // (2) Flip the TLA flag — but only if it's not already paid so a
          //     redelivered event doesn't overwrite the original paidAt.
          const tlaRef = adminDb.collection('tlas').doc(tlaId);
          const tlaSnap = await tlaRef.get();
          const alreadyPaid =
            tlaSnap.exists && (tlaSnap.data() as { matchFeePaid?: boolean })?.matchFeePaid === true;
          if (!alreadyPaid) {
            await tlaRef.update({
              matchFeePaid: true,
              matchFeePaymentId: paymentIntentId,
              matchFeePaidAt: nowIso,
            });

            // (3) Audit-log the first observation of the payment only.
            await adminDb.collection('audit_logs').add({
              action: 'match_fee_paid',
              userId: loadOwnerId,
              targetType: 'tla',
              targetId: tlaId,
              targetName: `TLA ${tlaId}`,
              details: {
                paymentIntentId,
                matchId,
                amount: session.amount_total ?? 2500,
              },
              timestamp: nowIso,
              createdAt: nowIso,
            });
          }
        }
        
        if (session.mode === 'subscription' && metadata?.userId && session.subscription) {
          // Fetch the subscription to get trial_end
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          
          const updateData: any = {
            stripeSubscriptionId: session.subscription,
            subscriptionStatus: subscription.status,
            subscriptionPlanType: metadata.planType || 'monthly',
            updatedAt: new Date().toISOString(),
          };
          
          if (subscription.trial_end) {
            updateData.trialEndsAt = new Date(subscription.trial_end * 1000).toISOString();
          }
          
          if (subscription.current_period_end) {
            updateData.subscriptionPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString();
          }
          
          await adminDb.collection('owner_operators').doc(metadata.userId).update(updateData);
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
