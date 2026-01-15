import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { stripe } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  console.log('🔵 =====Match payment API called=====');
  
  try {
    // Check authorization
    const authHeader = request.headers.get('Authorization');
    console.log('🔵 Auth header present:', !!authHeader);
    
    if (!authHeader?.startsWith('Bearer ')) {
      console.log('❌ No valid Authorization header');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    console.log('🔵 Token extracted, length:', token.length);
    
    // Verify token with Firebase Admin
    console.log('🔵 Attempting to verify ID token...');
    let decodedToken;
    try {
      const adminAuth = getAdminAuth();
      console.log('🔵 Got admin auth instance');
      decodedToken = await adminAuth.verifyIdToken(token);
      console.log('✅ Token verified successfully, uid:', decodedToken.uid);
    } catch (authError: any) {
      console.error('❌ Token verification failed:', authError);
      console.error('Auth error details:', {
        message: authError.message,
        code: authError.code,
        stack: authError.stack
      });
      return NextResponse.json({ 
        error: 'Authentication failed', 
        details: authError.message 
      }, { status: 401 });
    }
    
    const userId = decodedToken.uid;
    console.log('🔵 User ID:', userId);

    const body = await request.json();
    const { tlaId, matchId } = body;
    console.log('🔵 Request body:', { tlaId, matchId });

    if (!tlaId || !matchId) {
      console.log('❌ Missing required fields');
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify user is the load owner
    console.log('🔵 Fetching TLA document...');
    const adminDb = getAdminDb();
    const tlaDoc = await adminDb.collection('tlas').doc(tlaId).get();
    
    if (!tlaDoc.exists) {
      console.log('❌ TLA document not found');
      return NextResponse.json({ error: 'TLA not found' }, { status: 404 });
    }
    
    const tlaData = tlaDoc.data();
    console.log('🔵 TLA FULL DATA:', JSON.stringify(tlaData, null, 2));
    console.log('🔵 Current user ID:', userId);
    console.log('🔵 TLA lessee:', tlaData?.lessee);
    console.log('🔵 TLA lessor:', tlaData?.lessor);
    console.log('🔵 TLA lessee.ownerId:', tlaData?.lessee?.ownerId);
    console.log('🔵 TLA lessor.ownerId:', tlaData?.lessor?.ownerId);

    // FIXED: Check if user is the LESSOR (load owner who created the load)
    // In Trip Lease Agreements:
    // - LESSOR = Load owner (provides the load/work) - THIS IS WHO PAYS
    // - LESSEE = Driver's company (accepts the load/work)
    const isLessor = tlaData?.lessor?.ownerId === userId;
    const isLessee = tlaData?.lessee?.ownerId === userId;
    
    console.log('🔵 Is user lessor (load owner - who should pay)?', isLessor);
    console.log('🔵 Is user lessee (driver owner)?', isLessee);

    if (!isLessor) {
      console.log('❌ User is not the load owner (lessor)');
      return NextResponse.json({ 
        error: 'Unauthorized - must be load owner',
        debug: {
          userId,
          lesseeOwnerId: tlaData?.lessee?.ownerId,
          lessorOwnerId: tlaData?.lessor?.ownerId,
          isLessee,
          isLessor
        }
      }, { status: 403 });
    }

    console.log('✅ User authorized as load owner (lessor)');

    // Create checkout session for $25 match fee
    console.log('🔵 Creating Stripe checkout session...');
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

    console.log('✅ Stripe session created:', session.id);
    console.log('✅ Checkout URL:', session.url);
    return NextResponse.json({ url: session.url });
    
  } catch (error: any) {
    console.error('❌ Match payment error:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack,
      name: error.name
    });
    
    return NextResponse.json({ 
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}
