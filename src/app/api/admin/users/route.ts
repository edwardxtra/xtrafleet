/**
 * Admin: create an owner operator account from the admin console.
 *
 * The console used to write `owner_operators/{id}` straight from the browser,
 * but `firestore.rules` only lets a signed-in user create their *own* doc
 * (`allow create: if isSignedIn() && isOwner(ownerOperatorId)`), so an admin
 * creating someone else's record always failed with "Missing or insufficient
 * permissions". Creation therefore happens here, through the Admin SDK, which
 * bypasses rules — the same shape as /api/admin/onboard, minus the FMCSA
 * verification step (admins entering a record by hand may not have a DOT yet).
 *
 * The account is created as `pre-activated`, so the doc id becomes the Firebase
 * Auth uid when the customer claims it via /activate, and the admin can send
 * the activation email from the users list.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getFirebaseAdmin, FieldValue } from '@/lib/firebase-admin-singleton';
import { withCors } from '@/lib/api-cors';
import { hasPermission, getDefaultRoleForLegacyAdmin, type AdminRole } from '@/lib/admin-roles';

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status });
}

const bodySchema = z.object({
  companyName: z.string().trim().min(1, 'Company name is required'),
  legalName: z.string().trim().optional(),
  contactName: z.string().trim().optional(),
  contactEmail: z.string().trim().email('A valid email is required'),
  phone: z.string().trim().optional(),
  dotNumber: z.string().trim().optional(),
  mcNumber: z.string().trim().optional(),
  address: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  zipCode: z.string().trim().optional(),
});

async function handlePost(request: NextRequest) {
  try {
    const { auth, db } = await getFirebaseAdmin();

    // 1. Authenticate.
    const tokenCookie = request.cookies.get('fb-id-token');
    if (!tokenCookie) return json({ error: 'You must be signed in.' }, 401);
    let decoded: { uid: string; email?: string };
    try {
      try {
        decoded = await auth.verifySessionCookie(tokenCookie.value, true);
      } catch {
        decoded = await auth.verifyIdToken(tokenCookie.value);
      }
    } catch {
      return json({ error: 'Your session is invalid. Please sign in again.' }, 401);
    }
    const adminUid = decoded.uid;
    const adminEmail = decoded.email || '';

    // 2. Authorize — admin with the users:create permission.
    const adminSnap = await db.collection('owner_operators').doc(adminUid).get();
    const adminData = adminSnap.exists ? adminSnap.data() : null;
    if (!adminData?.isAdmin) {
      return json({ error: 'Admin access required.' }, 403);
    }
    const role: AdminRole = (adminData.adminRole as AdminRole) || getDefaultRoleForLegacyAdmin();
    if (!hasPermission(role, 'users:create')) {
      return json({ error: 'You do not have permission to create users.' }, 403);
    }

    // 3. Validate input.
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return json({ error: 'Invalid request body.' }, 400);
    }
    const parsed = bodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return json(
        {
          error:
            Object.values(parsed.error.flatten().fieldErrors).flat().join(', ') ||
            'Invalid input.',
        },
        400
      );
    }
    const input = parsed.data;
    const contactEmail = input.contactEmail.toLowerCase();

    // 4. Reject duplicates — an email that already has an Auth account, or an
    //    owner_operators record, would produce an account nobody can activate.
    try {
      await auth.getUserByEmail(contactEmail);
      return json({ error: 'An account with this email already exists.' }, 409);
    } catch (err: unknown) {
      const code =
        (err as { code?: string })?.code ||
        (err as { errorInfo?: { code?: string } })?.errorInfo?.code ||
        '';
      if (code !== 'auth/user-not-found') throw err;
    }
    const existing = await db
      .collection('owner_operators')
      .where('contactEmail', '==', contactEmail)
      .limit(1)
      .get();
    if (!existing.empty) {
      return json({ error: 'An account with this email already exists.' }, 409);
    }

    // 5. Create the pre-activated account. The doc id becomes the Firebase Auth
    //    uid at activation time (see /api/activate).
    const ooRef = db.collection('owner_operators').doc();
    const ownerOperatorId = ooRef.id;
    const now = new Date().toISOString();

    await ooRef.set({
      id: ownerOperatorId,
      companyName: input.companyName,
      legalName: input.legalName || input.companyName,
      contactName: input.contactName || '',
      contactEmail,
      phone: input.phone || '',
      dotNumber: input.dotNumber || '',
      mcNumber: input.mcNumber || '',
      address: input.address || '',
      city: input.city || '',
      state: input.state || '',
      zipCode: input.zipCode || '',
      subscriptionStatus: 'inactive',
      accountStatus: 'pre-activated',
      createdByAdmin: adminUid,
      createdAt: now,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 6. Audit.
    await db.collection('admin_audit').add({
      action: 'user_created',
      adminId: adminUid,
      adminEmail,
      targetType: 'owner_operator',
      targetId: ownerOperatorId,
      details: { companyName: input.companyName, contactEmail },
      timestamp: now,
    });

    return json({ success: true, ownerOperatorId }, 201);
  } catch (error) {
    console.error('[POST /api/admin/users]', error);
    return json({ error: 'An unexpected error occurred while creating the user.' }, 500);
  }
}

export const POST = withCors(handlePost);
