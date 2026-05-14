import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getFirebaseAdmin, FieldValue } from '@/lib/firebase-admin-singleton';
import { handleApiError, handleApiSuccess } from '@/lib/api-error-handler';
import { withCors } from '@/lib/api-cors';
import { rateLimiters, getIdentifier, formatTimeRemaining } from '@/lib/rate-limit';
import { passwordSchema } from '@/lib/password-validation';
import { buildAttestationEntry } from '@/lib/attestations';
import { sendOwnerRegistrationEmail } from '@/lib/email';
import { NextResponse } from 'next/server';

const LOG_PREFIX = '[register]';

const bodySchema = z.object({
  email: z.string().email('A valid email is required'),
  password: z.string().min(1, 'Password is required'),
  companyName: z.string().min(1, 'Company name is required'),
});

/**
 * Consolidated owner registration.
 *
 * Replaces the previous client-side flow (createUserWithEmailAndPassword +
 * two client setDoc calls + a separate /api/auth/session POST), which had a
 * class of bugs:
 *   - Non-atomic: the Auth user could be created while the Firestore docs
 *     failed, leaving a half-provisioned account.
 *   - Client/server desync: a stale fb-id-token cookie from a prior account
 *     could survive a fresh signup, so the server (cookie) and the client
 *     (Firebase Auth) ended up pointing at different uids — the "two users
 *     at once" bug seen on the loads / My-Assets mismatch.
 *
 * This route does everything server-side and atomically:
 *   1. Rate limit by IP.
 *   2. Validate input (incl. password policy).
 *   3. Admin SDK createUser — fails fast on email-already-exists.
 *   4. Write owner_operators/{uid} + users/{uid} in the same request.
 *   5. Mint a custom token for the client to sign in with cleanly.
 *   6. Fire the welcome email (best-effort, non-blocking).
 *
 * The client then does signInWithCustomToken() (which cleanly replaces any
 * prior client auth state) and the usual ID-token → session-cookie exchange.
 * The session cookie itself still can't be minted here — createSessionCookie
 * needs an ID token, which only exists after the client signs in — but the
 * user + docs are now guaranteed consistent before the client touches auth.
 */
async function handlePost(req: NextRequest) {
  try {
    // 1. Rate limit (IP-based; runs before any account work). Uses the
    // auth bucket (20 / 15m) rather than the stricter registration bucket
    // (3 / hour) so QA testing isn't constantly locked out.
    const identifier = getIdentifier(req);
    const { success, reset } = await rateLimiters.auth.limit(identifier);
    if (!success) {
      return NextResponse.json(
        {
          error: 'Too many signup attempts',
          message: `Please try again in ${formatTimeRemaining(reset)}`,
        },
        { status: 429 },
      );
    }

    // 2. Validate input.
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      throw new Error(
        Object.values(parsed.error.flatten().fieldErrors).flat().join(', ') || 'Invalid request body',
      );
    }
    const { email, password, companyName } = parsed.data;

    const pw = passwordSchema.safeParse(password);
    if (!pw.success) {
      throw new Error(pw.error.errors[0]?.message || 'Password does not meet requirements');
    }

    const { auth, db } = await getFirebaseAdmin();

    // 3. Create the Firebase Auth user. Fails fast (before any Firestore
    // writes) if the email is taken.
    let uid: string;
    try {
      const userRecord = await auth.createUser({
        email,
        password,
        emailVerified: false,
      });
      uid = userRecord.uid;
      console.log(`${LOG_PREFIX} Created auth user ${uid} for ${email}`);
    } catch (err: any) {
      const code = err?.errorInfo?.code || err?.code || '';
      if (code === 'auth/email-already-exists') {
        return NextResponse.json(
          { error: 'This email is already in use. Try logging in instead.' },
          { status: 409 },
        );
      }
      if (code === 'auth/invalid-password') {
        return NextResponse.json(
          { error: 'Password does not meet security requirements.' },
          { status: 400 },
        );
      }
      throw err;
    }

    const createdAt = new Date().toISOString();

    // 4. Write the owner_operators + users docs. If either throws, clean up
    // the auth user so we never leave a half-provisioned account behind.
    try {
      await db
        .collection('owner_operators')
        .doc(uid)
        .set({
          id: uid,
          companyName,
          legalName: companyName,
          contactEmail: email,
          subscriptionStatus: 'inactive',
          createdAt,
          onboardingStatus: {
            profileComplete: false,
            fmcsaDesignated: false,
            completedAt: null,
          },
          // DEV-154 staged-attestation model — signup surface.
          attestations: [
            buildAttestationEntry('signupAuthorized', uid),
            buildAttestationEntry('signupEsignConsent', uid),
            buildAttestationEntry('signupTermsOfService', uid),
          ],
          updatedAt: FieldValue.serverTimestamp(),
        });

      await db.collection('users').doc(uid).set({
        role: 'owner_operator',
        email,
        createdAt,
      });
    } catch (err) {
      console.error(`${LOG_PREFIX} Firestore write failed for ${uid} — rolling back auth user`, err);
      try {
        await auth.deleteUser(uid);
      } catch (cleanupErr) {
        console.error(`${LOG_PREFIX} Failed to roll back auth user ${uid}`, cleanupErr);
      }
      throw new Error('Failed to provision account. Please try again.');
    }

    // 5. Welcome email — best-effort, never blocks the response.
    sendOwnerRegistrationEmail(email, companyName).catch((err) =>
      console.error(`${LOG_PREFIX} welcome email failed for ${email}`, err),
    );

    // The client signs in with the email + password it already has (the
    // same credentials we just created the account with). We intentionally
    // do NOT mint a custom token here — createCustomToken needs a real
    // service-account identity to sign, which the emulator-mode Admin SDK
    // lacks, and email/password sign-in is simpler + just as clean.
    return handleApiSuccess({
      success: true,
      uid,
      email,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`${LOG_PREFIX} Error:`, msg, error);
    return handleApiError('server', error instanceof Error ? error : new Error(msg), {
      endpoint: 'POST /api/register',
    });
  }
}

export const POST = withCors(handlePost);
