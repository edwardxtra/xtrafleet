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
    const { tlaId, matchId } = body;

    if (!tlaId || !matchId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify user is the load owner
    const tlaDoc = await getAdminDb().collection('tlas').doc(tlaId).get();
    const tlaData = tlaDoc.data();

    if (tlaData?.lessee?.ownerId !== userId) {
      return NextResponse.json({ error: 'Unauthorized - must be load owner' }, { status: 403 });
    }

    // Create checkout session for $25 match fee
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'TLA Match Fee',
            description: `One-time fee for Trip Lease Agreement ${tlaId}`
          },
          unit_amount: 2500 // $25.00
        },
        quantity: 1
      }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://xtrafleet.com'}/dashboard/tla/${tlaId}?payment=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://xtrafleet.com'}/dashboard/tla/${tlaId}?payment=canceled`,
      metadata: {
        type: 'match_fee',
        tlaId,
        matchId,
        loadOwnerId: userId
      }
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error('Match payment error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
