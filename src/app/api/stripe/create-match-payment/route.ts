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
    const { tlaId, matchId } = body;

    if (!tlaId || !matchId) {
      return NextResponse.json(
        { error: 'TLA ID and Match ID are required' },
        { status: 400 }
      );
    }

    // Get match data to verify load owner
    const matchDoc = await adminDb.collection('matches').doc(matchId).get();
    if (!matchDoc.exists) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    const matchData = matchDoc.data();
    const loadOwnerId = matchData?.loadOwnerId;

    // Verify the requesting user is the load owner
    if (loadOwnerId !== userId) {
      return NextResponse.json(
        { error: 'Only the load owner can pay the match fee' },
        { status: 403 }
      );
    }

    // Get load owner's Stripe customer ID
    const loadOwnerDoc = await adminDb.collection('owner_operators').doc(loadOwnerId).get();
    const loadOwnerData = loadOwnerDoc.data();
    const customerId = loadOwnerData?.stripeCustomerId;

    if (!customerId) {
      return NextResponse.json(
        { error: 'No payment method on file. Please add a payment method first.' },
        { status: 400 }
      );
    }

    // Create checkout session for $25 match fee
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Match Fee',
              description: `Match fee for TLA ${tlaId}`,
            },
            unit_amount: 2500, // $25.00
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/tla/${tlaId}?payment=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/tla/${tlaId}?payment=canceled`,
      metadata: {
        type: 'match_fee',
        tlaId: tlaId,
        matchId: matchId,
        loadOwnerId: loadOwnerId,
      },
    });

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error: any) {
    console.error('Error creating match payment:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create payment session' },
      { status: 500 }
    );
  }
}
