import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase-admin-singleton';
import {
  AdminRole,
  AdminPermission,
  hasPermission,
  getDefaultRoleForLegacyAdmin,
} from '@/lib/admin-roles';

export type AdminContext = {
  uid: string;
  email: string;
  role: AdminRole;
};

/**
 * Verify token - handles both ID tokens and session cookies
 */
async function verifyToken(auth: any, tokenValue: string) {
  // Try verifying as session cookie first (most common for logged-in users)
  try {
    return await auth.verifySessionCookie(tokenValue, true);
  } catch {
    // If that fails, try as regular ID token
    try {
      return await auth.verifyIdToken(tokenValue);
    } catch {
      throw new Error('Invalid authentication token');
    }
  }
}

/**
 * Middleware to verify admin access and role permissions
 * Returns the admin context if authorized, or a NextResponse error
 */
export async function withAdminAuth(
  req: NextRequest,
  requiredPermission?: AdminPermission
): Promise<AdminContext | NextResponse> {
  try {
    const { auth, db } = await getFirebaseAdmin();

    // Get token from cookie
    const token = req.cookies.get('fb-id-token');
    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'No authentication token provided' },
        { status: 401 }
      );
    }

    // Verify token
    const decodedToken = await verifyToken(auth, token.value);

    // Check if user is admin
    const userDoc = await db.collection('owner_operators').doc(decodedToken.uid).get();
    if (!userDoc.exists) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'User not found' },
        { status: 403 }
      );
    }

    const userData = userDoc.data();
    if (!userData?.isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Admin access required' },
        { status: 403 }
      );
    }

    // Get admin role (fallback for legacy admins)
    const role = (userData.adminRole as AdminRole) || getDefaultRoleForLegacyAdmin();

    // Check specific permission if required
    if (requiredPermission && !hasPermission(role, requiredPermission)) {
      return NextResponse.json(
        { error: 'Forbidden', message: `Permission denied: ${requiredPermission}` },
        { status: 403 }
      );
    }

    return {
      uid: decodedToken.uid,
      email: decodedToken.email || userData.contactEmail || '',
      role,
    };
  } catch (error) {
    console.error('[Admin Auth Error]', error);
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Authentication failed' },
      { status: 401 }
    );
  }
}

/**
 * Helper to check if withAdminAuth returned an error response
 */
export function isErrorResponse(result: AdminContext | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}

/**
 * Higher-order function to wrap an admin API handler with auth
 */
export function createAdminHandler<T = any>(
  handler: (req: NextRequest, admin: AdminContext) => Promise<NextResponse<T>>,
  requiredPermission?: AdminPermission
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const authResult = await withAdminAuth(req, requiredPermission);

    if (isErrorResponse(authResult)) {
      return authResult;
    }

    return handler(req, authResult);
  };
}
