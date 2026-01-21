import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase-admin-singleton';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lazy import stripe to avoid build-time errors
async function getStripe() {
  const { stripe } = await import('@/lib/stripe');
  return stripe;
}

export async function POST(request: NextRequest) {
  try {
    // Check authorization
    const authHeader = request.headers.get('Authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);

    // Verify token with Firebase Admin
    const { auth, db } = await getFirebaseAdmin();
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch (authError: any) {
      console.error('[Match Payment] Token verification failed:', authError.message);
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    const userId = decodedToken.uid;

    const body = await request.json();
    const { tlaId, matchId } = body;

    if (!tlaId || !matchId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify user is the load owner
    const tlaDoc = await db.collection('tlas').doc(tlaId).get();

    if (!tlaDoc.exists) {
      return NextResponse.json({ error: 'TLA not found' }, { status: 404 });
    }

    const tlaData = tlaDoc.data();

    // CORRECT: Check if user is the LESSEE (load owner/hiring carrier who pays)
    // In XtraFleet TLAs:
    // - LESSEE = Load owner/hiring carrier (the one posting loads) - PAYS THE FEE
    // - LESSOR = Driver provider (owns the driver/equipment)
    const isLessee = tlaData?.lessee?.ownerId === userId;

    // ALSO check if the lessee company name matches the user's owner_operator company
    // This is a fallback in case ownerId isn't set properly
    if (!isLessee) {
      const ownerDoc = await db.collection('owner_operators').doc(userId).get();
      if (ownerDoc.exists) {
        const ownerData = ownerDoc.data();

        // Check if company names match (case-insensitive)
        const companyMatch = ownerData?.companyName && tlaData?.lessee?.companyName &&
          ownerData.companyName.toLowerCase() === tlaData.lessee.companyName.toLowerCase();

        if (!companyMatch) {
          console.error('[Match Payment] Unauthorized attempt', { userId, tlaId });
          return NextResponse.json({ error: 'Unauthorized - must be load owner' }, { status: 403 });
        }
        // Fall through to payment creation if company matches
      } else {
        console.error('[Match Payment] Unauthorized attempt - no owner doc', { userId, tlaId });
        return NextResponse.json({ error: 'Unauthorized - must be load owner' }, { status: 403 });
      }
    }

    // Create checkout session for $25 match fee
    const stripe = await getStripe();
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
    console.error('[Match Payment] Error:', error.message);
    return NextResponse.json({ error: 'An error occurred. Please try again.' }, { status: 500 });
  }
}
