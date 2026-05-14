import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getFirebaseAdmin, FieldValue } from '@/lib/firebase-admin-singleton';
import { handleApiError, handleApiSuccess } from '@/lib/api-error-handler';
import { withCors } from '@/lib/api-cors';
import { ATTESTATIONS, type AttestationType } from '@/lib/attestations';
import { logAuditEvent, AuditActions } from '@/lib/audit-logger';

const LOG_PREFIX = '[append-attestations]';

// Recapturable attestation surfaces. Locked allowlist — other surfaces
// (match_confirm_*, tla, post_trip) have their own dedicated flows and
// should not be writable here.
const ALLOWED_TYPES = new Set<AttestationType>([
  // surface: 'driver_add'
  'driverDqf',
  'driverFmcsaChecks',
  'driverAuthority',
  // surface: 'profile'
  'profileInsurance',
  'profileAuthority',
]);

const bodySchema = z.object({
  types: z.array(z.string()).min(1, 'at least one attestation type required'),
  driverId: z.string().min(1).optional(),
  deviceInfo: z.record(z.any()).optional(),
});

async function verifyToken(auth: any, tokenValue: string) {
  try {
    return await auth.verifySessionCookie(tokenValue, true);
  } catch {
    return await auth.verifyIdToken(tokenValue);
  }
}

async function handlePost(req: NextRequest) {
  try {
    const { auth, db } = await getFirebaseAdmin();
    const token = req.cookies.get('fb-id-token');
    if (!token) throw new Error('Unauthorized');

    const owner = await verifyToken(auth, token.value);

    const body = await req.json();
    const validation = bodySchema.safeParse(body);
    if (!validation.success) {
      const errs = Object.values(validation.error.flatten().fieldErrors).flat().join(', ');
      throw new Error(errs || 'Invalid request body');
    }
    const { types, driverId, deviceInfo } = validation.data;

    const valid = types.filter((t): t is AttestationType =>
      ALLOWED_TYPES.has(t as AttestationType),
    );
    if (valid.length === 0) {
      throw new Error('No allowed attestation types in request');
    }

    // Surface integrity: driver_add types require a driverId; profile types
    // must NOT have one. Mixing them in a single call is rejected.
    const hasDriverTypes = valid.some(t => ATTESTATIONS[t].surface === 'driver_add');
    const hasProfileTypes = valid.some(t => ATTESTATIONS[t].surface === 'profile');
    if (hasDriverTypes && hasProfileTypes) {
      throw new Error('Cannot mix driver_add and profile attestations in one call');
    }
    if (hasDriverTypes && !driverId) {
      throw new Error('driverId is required for driver_add attestations');
    }
    if (hasProfileTypes && driverId) {
      throw new Error('driverId must be omitted for profile attestations');
    }

    // If this is a driver_add call, verify the driver doc exists under this
    // owner — no cross-owner writes.
    if (hasDriverTypes) {
      const driverRef = db
        .collection('owner_operators')
        .doc(owner.uid)
        .collection('drivers')
        .doc(driverId!);
      const driverDoc = await driverRef.get();
      if (!driverDoc.exists()) {
        throw new Error('Driver document not found');
      }
    }

    const ipAddress =
      req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || undefined;
    const acceptedAt = new Date().toISOString();

    const entries = valid.map(type => {
      const def = ATTESTATIONS[type];
      return {
        type,
        version: def.v,
        text: def.text,
        acceptedAt,
        acceptedBy: owner.uid,
        ip: ipAddress,
        // Firestore rejects undefined values — only include userAgent when present.
        ...(userAgent !== undefined ? { userAgent } : {}),
        ...(hasDriverTypes
          ? { context: { driverId, ...(deviceInfo ? { deviceInfo } : {}) } }
          : deviceInfo
            ? { context: { deviceInfo } }
            : {}),
      };
    });

    const ownerRef = db.collection('owner_operators').doc(owner.uid);
    await ownerRef.update({
      attestations: FieldValue.arrayUnion(...entries),
      updatedAt: FieldValue.serverTimestamp(),
    });

    console.log(
      `${LOG_PREFIX} Appended ${entries.length} attestation(s) for owner ${owner.uid}` +
        (driverId ? `, driver ${driverId}` : '') +
        `: ${valid.join(', ')}`,
    );

    await logAuditEvent({
      action: AuditActions.DRIVER_PROFILE_SUBMITTED,
      userId: owner.uid,
      userRole: 'owner_operator',
      targetId: driverId || owner.uid,
      targetType: hasDriverTypes ? 'driver' : 'owner_operator',
      metadata: {
        attestationRecapture: true,
        surface: hasDriverTypes ? 'driver_add' : 'profile',
        types: valid,
      },
      ipAddress,
      userAgent,
    });

    return handleApiSuccess({
      success: true,
      captured: valid,
      message: `Captured ${valid.length} attestation(s).`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`${LOG_PREFIX} Error:`, errorMessage, error);
    if (errorMessage === 'Unauthorized') {
      return handleApiError(
        'unauthorized',
        error instanceof Error ? error : new Error(errorMessage),
        { endpoint: 'POST /api/append-attestations' },
      );
    }
    return handleApiError(
      'server',
      error instanceof Error ? error : new Error(errorMessage),
      { endpoint: 'POST /api/append-attestations' },
    );
  }
}

export const POST = withCors(handlePost);
