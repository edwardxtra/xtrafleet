import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

/**
 * ONE-TIME USE: Upgrade a user to super_admin
 * This endpoint should be removed after initial setup
 *
 * Usage: POST /api/admin/bootstrap
 * Body: { "email": "edward@xtrafleet.com", "secretKey": "xtrafleet-bootstrap-2024" }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, secretKey } = body;

    // Simple security check - change this key before deploying
    if (secretKey !== 'xtrafleet-bootstrap-2024') {
      return NextResponse.json({ error: 'Invalid secret key' }, { status: 403 });
    }

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Find user by email
    const usersSnapshot = await adminDb
      .collection('owner_operators')
      .where('contactEmail', '==', email)
      .limit(1)
      .get();

    if (usersSnapshot.empty) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userDoc = usersSnapshot.docs[0];
    const userId = userDoc.id;

    // Update to super_admin
    await adminDb.collection('owner_operators').doc(userId).update({
      isAdmin: true,
      adminRole: 'super_admin',
      adminGrantedAt: new Date().toISOString(),
      adminGrantedBy: 'bootstrap',
    });

    return NextResponse.json({
      success: true,
      message: `User ${email} upgraded to super_admin`,
      userId,
    });

  } catch (error: any) {
    console.error('Bootstrap error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
