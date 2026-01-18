import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';

const APP_NAME = 'xtrafleet-admin';

// Initialize Firebase Admin - tries full JSON first, then individual vars
function getFirebaseAdmin() {
  console.log('🔵 Getting Firebase Admin, current apps:', admin.apps.map(a => a?.name).join(', ') || 'none');

  try {
    const existingApp = admin.app(APP_NAME);
    console.log('🔵 Found existing app:', APP_NAME);
    return existingApp;
  } catch (e) {
    console.log('🔵 App not found, creating new one...');
  }

  // Option 1: Try full service account JSON (recommended - avoids newline issues)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      console.log('🔵 Trying FIREBASE_SERVICE_ACCOUNT...');
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      const app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      }, APP_NAME);
      console.log('✅ Firebase Admin initialized with service account JSON');
      return app;
    } catch (error: any) {
      console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT:', error.message);
      // Fall through to try individual variables
    }
  }

  // Option 2: Try individual environment variables (legacy)
  console.log('🔵 Trying individual env vars...');
  console.log('🔵 FB_PROJECT_ID:', process.env.FB_PROJECT_ID || 'NOT SET');
  console.log('🔵 FB_CLIENT_EMAIL:', process.env.FB_CLIENT_EMAIL || 'NOT SET');
  console.log('🔵 FB_PRIVATE_KEY length:', process.env.FB_PRIVATE_KEY?.length || 0);

  const privateKey = process.env.FB_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!process.env.FB_PROJECT_ID || !process.env.FB_CLIENT_EMAIL || !privateKey) {
    console.error('❌ Missing environment variables!');
    console.error('❌ Create FIREBASE_SERVICE_ACCOUNT secret with full JSON to fix this');
    throw new Error("Firebase server-side environment variables are not set.");
  }

  try {
    const app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FB_PROJECT_ID,
        clientEmail: process.env.FB_CLIENT_EMAIL,
        privateKey: privateKey,
      }),
    }, APP_NAME);
    console.log('✅ Firebase Admin initialized with individual env vars');
    return app;
  } catch (initError) {
    console.error('❌ Firebase Admin initialization error:', initError);
    throw initError;
  }
}

export async function POST(request: NextRequest) {
  console.log('🔵 ===== SESSION API ROUTE HIT =====');
  console.log('🔵 Request URL:', request.url);
  console.log('🔵 Host header:', request.headers.get('host'));
  
  try {
    const { token } = await request.json();
    
    console.log('🔵 Token received:', token ? 'YES' : 'NO');
    
    if (!token) {
      console.log('🔵 No token provided, deleting cookie');
      const response = NextResponse.json({ success: true });
      response.cookies.delete('fb-id-token');
      return response;
    }
    
    // Verify the token is valid
    try {
      const app = getFirebaseAdmin();
      const decodedToken = await admin.auth(app).verifyIdToken(token);
      console.log('✅ Token verified for user:', decodedToken.uid);
    } catch (verifyError) {
      console.error('❌ Token verification failed:', verifyError);
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid token' 
      }, { status: 401 });
    }
    
    // Create response with cookie
    const response = NextResponse.json({ success: true });
    
    // Set cookie on the response directly
    response.cookies.set('fb-id-token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
    
    console.log('✅ Cookie set successfully on response');
    
    return response;
  } catch (error) {
    console.error('❌ Session API error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to set session' 
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  console.log('🔵 DELETE session - removing cookie');
  const response = NextResponse.json({ success: true });
  response.cookies.delete('fb-id-token');
  return response;
}
