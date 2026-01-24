import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase-admin-singleton';

/**
 * One-time bootstrap endpoint to upgrade a user to super_admin
 * DELETE THIS FILE AFTER USE
 */
export async function POST(req: NextRequest) {
  try {
    const { auth, db } = await getFirebaseAdmin();

    // Get token from cookie
    const token = req.cookies.get('fb-id-token');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify token
    let decodedToken;
    try {
      decodedToken = await auth.verifySessionCookie(token.value, true);
    } catch {
      try {
        decodedToken = await auth.verifyIdToken(token.value);
      } catch {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
      }
    }

    // Upgrade user to super_admin
    await db.collection('owner_operators').doc(decodedToken.uid).update({
      isAdmin: true,
      adminRole: 'super_admin',
      adminGrantedAt: new Date().toISOString(),
      adminGrantedBy: 'bootstrap',
    });

    return NextResponse.json({
      success: true,
      message: 'User upgraded to super_admin',
      userId: decodedToken.uid,
    });
  } catch (error: any) {
    console.error('Bootstrap error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
