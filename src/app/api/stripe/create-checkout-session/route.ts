import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    const userId = decodedToken.uid;

    const body = await request.json();
    const { priceId, planType } = body;

    if (!priceId || !planType) {
      return NextResponse.json(
        { error: 'Price ID and plan type are required' },
        { status: 400 }
      );
    }

    // Get or create Stripe customer
    const userDoc = await adminDb.collection('owner_operators').doc(userId).get();
    const userData = userDoc.data();

    let customerId = userData?.stripeCustomerId;

    if (!customerId) {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: userData?.contactEmail || decodedToken.email || undefined,
        name: userData?.legalName || userData?.companyName || undefined,
        metadata: {
          userId: userId,
          companyName: userData?.companyName || '',
        },
      });
      customerId = customer.id;

      // Save customer ID to Firestore
      await adminDb.collection('owner_operators').doc(userId).update({
        stripeCustomerId: customerId,
      });
    }

    // Determine trial period (90 days for beta, 14 days for production)
    const isBetaUser = userData?.isBetaUser === true;
    const trialPeriodDays = isBetaUser ? 90 : 14;

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: trialPeriodDays,
        metadata: {
          userId: userId,
          planType: planType,
          isBetaUser: isBetaUser.toString(),
        },
      },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?canceled=true`,
      metadata: {
        userId: userId,
        planType: planType,
      },
    });

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error: any) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
