import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { stripe } = await import('@/lib/stripe');
    const { getAdminAuth, getAdminDb } = await import('@/lib/firebase-admin');
    
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const decodedToken = await getAdminAuth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const body = await request.json();
    const { priceId, planType } = body;

    if (!priceId || !planType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get or create Stripe customer
    const userDoc = await getAdminDb().collection('owner_operators').doc(userId).get();
    const userData = userDoc.data();
    let customerId = userData?.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userData?.email || decodedToken.email,
        metadata: { userId }
      });
      customerId = customer.id;
      
      await getAdminDb().collection('owner_operators').doc(userId).update({
        stripeCustomerId: customerId
      });
    }

    // Determine trial period
    const isBetaUser = userData?.isBetaUser === true;
    const trialPeriodDays = isBetaUser ? 90 : 14;

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://xtrafleet.com'}/dashboard/billing?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://xtrafleet.com'}/dashboard/billing?canceled=true`,
      subscription_data: {
        trial_period_days: trialPeriodDays,
        metadata: { userId, planType }
      },
      metadata: { userId, planType }
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error('Checkout error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
