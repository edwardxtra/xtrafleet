/**
 * Admin pre-registration endpoint — white-glove onboarding (DEV-158 part 2).
 *
 * An admin pre-registers a customer's fleet on their behalf: this verifies the
 * carrier against FMCSA, creates a pre-activated owner_operators account, and
 * issues a one-time activation token. The activation link is returned to the
 * admin UI; the customer later claims the account via /activate.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getFirebaseAdmin, FieldValue } from '@/lib/firebase-admin-singleton';
import { withCors } from '@/lib/api-cors';
import { hasPermission, getDefaultRoleForLegacyAdmin, type AdminRole } from '@/lib/admin-roles';
import { lookupByDOT } from '@/lib/fmcsa';
import { sendActivationEmail } from '@/lib/email';
import {
  generateActivationToken,
  hashActivationToken,
  ACTIVATION_TOKEN_TTL_DAYS,
} from '@/lib/activation-tokens';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://xtrafleet.com';

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status });
}

const bodySchema = z.object({
  companyName: z.string().trim().min(1, 'Company name is required'),
  legalName: z.string().trim().optional(),
  contactName: z.string().trim().min(1, 'Contact name is required'),
  contactEmail: z.string().trim().email('A valid contact email is required'),
  phone: z.string().trim().optional(),
  dotNumber: z.string().trim().min(1, 'DOT number is required'),
  mcNumber: z.string().trim().optional(),
  address: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  zip: z.string().trim().optional(),
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
      return json({ error: 'You do not have permission to onboard customers.' }, 403);
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

    // 4. Reject if the contact email already belongs to a real account —
    //    otherwise the pre-activated account could never be activated.
    try {
      await auth.getUserByEmail(input.contactEmail);
      return json({ error: 'An account with this email already exists.' }, 409);
    } catch (err: unknown) {
      const code =
        (err as { code?: string })?.code ||
        (err as { errorInfo?: { code?: string } })?.errorInfo?.code ||
        '';
      if (code !== 'auth/user-not-found') throw err;
    }

    // 5. Verify the carrier against FMCSA (same source as normal onboarding).
    const fmcsa = await lookupByDOT(input.dotNumber);
    if (!fmcsa.success || !fmcsa.carrier) {
      return json(
        { error: `FMCSA verification failed: ${fmcsa.error || 'carrier not found'}.` },
        422
      );
    }
    const carrier = fmcsa.carrier;

    const now = new Date().toISOString();

    // 6. Create the pre-activated account. The doc id is generated now and
    //    becomes the Firebase Auth uid at activation time.
    const ooRef = db.collection('owner_operators').doc();
    const ownerOperatorId = ooRef.id;

    await ooRef.set({
      id: ownerOperatorId,
      companyName: input.companyName,
      legalName: input.legalName || carrier.legalName || input.companyName,
      contactName: input.contactName,
      contactEmail: input.contactEmail,
      phone: input.phone || carrier.phone || '',
      dotNumber: input.dotNumber,
      mcNumber: input.mcNumber || carrier.mcNumber || '',
      address: input.address || carrier.hqAddress || '',
      city: input.city || carrier.hqCity || '',
      state: input.state || carrier.hqState || '',
      zip: input.zip || carrier.hqZip || '',
      subscriptionStatus: 'inactive',
      accountStatus: 'pre-activated',
      createdByAdmin: adminUid,
      createdAt: now,
      onboardingStatus: {
        profileComplete: true,
        fmcsaDesignated: false,
        completedAt: now,
      },
      attestations: [],
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 7. Issue the one-time activation token (stored hashed).
    const rawToken = generateActivationToken();
    const expiresAt = new Date(
      Date.now() + ACTIVATION_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();
    await db
      .collection('activation_tokens')
      .doc(hashActivationToken(rawToken))
      .set({
        ownerOperatorId,
        email: input.contactEmail,
        companyName: input.companyName,
        recipientName: input.contactName,
        createdByAdmin: adminUid,
        createdAt: now,
        expiresAt,
      });

    const activationUrl = `${APP_URL}/activate?token=${rawToken}`;

    // 8. Email the activation link to the customer (best-effort — the admin
    //    still gets the link in the response as a backup).
    sendActivationEmail(input.contactEmail, input.contactName, activationUrl).catch(err =>
      console.error('[admin/onboard] activation email failed', err)
    );

    // 9. Audit.
    await db.collection('admin_audit').add({
      action: 'pre_registered_account',
      adminId: adminUid,
      adminEmail,
      targetType: 'owner_operator',
      targetId: ownerOperatorId,
      details: { companyName: input.companyName, dotNumber: input.dotNumber },
      timestamp: now,
    });

    return json(
      {
        success: true,
        ownerOperatorId,
        activationUrl,
        expiresAt,
        carrier: {
          legalName: carrier.legalName,
          authorityStatus: carrier.authorityStatus,
          allowedToOperate: carrier.allowedToOperate ?? false,
        },
      },
      200
    );
  } catch (error) {
    console.error('[POST /api/admin/onboard]', error);
    return json(
      { error: 'An unexpected error occurred while pre-registering the account.' },
      500
    );
  }
}

export const POST = withCors(handlePost);
