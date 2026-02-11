import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase-admin-singleton';
import { sendOwnerRegistrationEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    // Verify the session cookie
    const sessionCookie = request.cookies.get('session')?.value;
    if (!sessionCookie) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { auth } = await getFirebaseAdmin();
    const decodedToken = await auth.verifySessionCookie(sessionCookie, true);

    const { email, companyName } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const result = await sendOwnerRegistrationEmail(
      email,
      companyName || ''
    );

    if (result.success) {
      return NextResponse.json({ success: true });
    } else {
      console.error('Failed to send welcome email:', result.error);
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }
  } catch (error: any) {
    console.error('Send welcome email error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
