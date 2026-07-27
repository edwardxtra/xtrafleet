/**
 * Activation endpoint for white-glove pre-activation onboarding (DEV-158).
 *
 * GET  /api/activate?token=...  — validate a token, return prefill info for
 *                                 the activation page (does NOT consume it).
 * POST /api/activate            — { token, password }: create the Firebase
 *                                 Auth user, flip the account to active, and
 *                                 consume the one-time token.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase-admin-singleton';
import { withCors } from '@/lib/api-cors';
import { rateLimiters, getIdentifier, formatTimeRemaining } from '@/lib/rate-limit';
import { passwordSchema } from '@/lib/password-validation';
import { hashActivationToken } from '@/lib/activation-tokens';

type AdminDb = Awaited<ReturnType<typeof getFirebaseAdmin>>['db'];

interface ActivationTokenDoc {
  ownerOperatorId: string;
  email: string;
  companyName?: string;
  recipientName?: string;
  matchSummary?: string;
  createdByAdmin: string;
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
}

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status });
}

/** Load a token by its raw value and check it is unused and unexpired. */
async function loadValidToken(
  db: AdminDb,
  rawToken: string
): Promise<
  | { error: string; status: number }
  | { tokenId: string; data: ActivationTokenDoc }
> {
  const tokenId = hashActivationToken(rawToken);
  const snap = await db.collection('activation_tokens').doc(tokenId).get();
  if (!snap.exists) {
    return { error: 'This activation link is not valid.', status: 404 };
  }
  const data = snap.data() as ActivationTokenDoc;
  if (data.consumedAt) {
    return { error: 'This activation link has already been used.', status: 410 };
  }
  if (new Date(data.expiresAt).getTime() < Date.now()) {
    return {
      error: 'This activation link has expired. Please ask your XtraFleet contact for a new one.',
      status: 410,
    };
  }
  return { tokenId, data };
}

async function handleGet(request: NextRequest) {
  try {
    const rawToken = request.nextUrl.searchParams.get('token');
    if (!rawToken) {
      return json({ valid: false, error: 'This activation link is missing its code.' }, 400);
    }

    const { db } = await getFirebaseAdmin();
    const result = await loadValidToken(db, rawToken);
    if ('error' in result) {
      return json({ valid: false, error: result.error }, result.status);
    }

    const { data } = result;
    return json(
      {
        valid: true,
        email: data.email,
        companyName: data.companyName ?? null,
        recipientName: data.recipientName ?? null,
        matchSummary: data.matchSummary ?? null,
      },
      200
    );
  } catch (error) {
    console.error('[GET /api/activate]', error);
    return json({ valid: false, error: 'Could not validate this link. Please try again.' }, 500);
  }
}

async function handlePost(request: NextRequest) {
  // Rate limit by IP — defense in depth against token guessing.
  const { success, reset } = await rateLimiters.activation.limit(getIdentifier(request));
  if (!success) {
    return json(
      { error: `Too many activation attempts. Please try again in ${formatTimeRemaining(reset)}.` },
      429
    );
  }

  try {
    let body: { token?: unknown; password?: unknown };
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid request body.' }, 400);
    }
    const rawToken = typeof body.token === 'string' ? body.token : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!rawToken) {
      return json({ error: 'This activation link is missing its code.' }, 400);
    }

    const pw = passwordSchema.safeParse(password);
    if (!pw.success) {
      return json({ error: pw.error.errors[0]?.message || 'Password does not meet requirements.' }, 400);
    }

    const { auth, db } = await getFirebaseAdmin();

    const result = await loadValidToken(db, rawToken);
    if ('error' in result) {
      return json({ error: result.error }, result.status);
    }
    const { tokenId, data } = result;

    // The pre-activated account must still exist and not be activated yet.
    const ooRef = db.collection('owner_operators').doc(data.ownerOperatorId);
    const ooSnap = await ooRef.get();
    if (!ooSnap.exists) {
      return json({ error: 'The account for this link no longer exists.' }, 404);
    }
    const oo = ooSnap.data() as { accountStatus?: string };
    if (oo.accountStatus !== 'pre-activated') {
      return json({ error: 'This account has already been activated.' }, 409);
    }

    // Create the Firebase Auth user with uid == the pre-activated doc id, so
    // every existing rule and match/TLA reference keyed on that id stays valid.
    try {
      await auth.createUser({
        uid: data.ownerOperatorId,
        email: data.email,
        password,
        emailVerified: true,
      });
    } catch (err: unknown) {
      const code =
        (err as { errorInfo?: { code?: string } })?.errorInfo?.code ||
        (err as { code?: string })?.code ||
        '';
      if (code === 'auth/uid-already-exists' || code === 'auth/email-already-exists') {
        return json({ error: 'This account has already been activated.' }, 409);
      }
      if (code === 'auth/invalid-password') {
        return json({ error: 'Password does not meet security requirements.' }, 400);
      }
      throw err;
    }

    const now = new Date().toISOString();

    // Flip the account to active.
    await ooRef.update({ accountStatus: 'active', activatedAt: now });

    // Role document — mirrors what /api/register writes for a normal signup.
    await db.collection('users').doc(data.ownerOperatorId).set({
      role: 'owner_operator',
      email: data.email,
      createdAt: now,
    });

    // Consume the token — one-time use.
    await db.collection('activation_tokens').doc(tokenId).update({ consumedAt: now });

    return json({ success: true, email: data.email }, 200);
  } catch (error) {
    console.error('[POST /api/activate]', error);
    return json({ error: 'An unexpected error occurred during activation.' }, 500);
  }
}

export const GET = withCors(handleGet);
export const POST = withCors(handlePost);
