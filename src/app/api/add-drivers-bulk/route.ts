import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getFirebaseAdmin, FieldValue, Timestamp } from '@/lib/firebase-admin-singleton';
import { handleApiError, handleApiSuccess } from '@/lib/api-error-handler';
import { withCors } from '@/lib/api-cors';
import { Resend } from 'resend';
import { buildAttestationEntry, type AttestationType } from '@/lib/attestations';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const DRIVER_ADD_ATTESTATIONS: AttestationType[] = [
  'driverDqf',
  'driverFmcsaChecks',
  'driverAuthority',
];

// Accept either the new `attestDriverAdd: true` flag (DEV-154 phase 3) or
// the legacy `dqfCertification` shape. Both are optional in the schema; the
// handler validates that at least one is present.
const bulkInviteSchema = z.object({
  drivers: z.array(z.object({
    firstName: z.string().min(1, 'First name required'),
    lastName: z.string().min(1, 'Last name required'),
    email: z.string().email('Invalid email'),
  })).min(1).max(10),
  attestDriverAdd: z.boolean().optional(),
  dqfCertification: z.object({
    accepted: z.boolean(),
    timestamp: z.string(),
    userId: z.string(),
  }).optional(),
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

    const ownerUser = await verifyToken(auth, token.value);
    const body = await req.json();
    const validation = bulkInviteSchema.safeParse(body);

    if (!validation.success) {
      throw new Error(Object.values(validation.error.flatten().fieldErrors).flat().join(', '));
    }

    const { drivers, attestDriverAdd, dqfCertification } = validation.data;
    if (!attestDriverAdd && !dqfCertification?.accepted) {
      throw new Error('Driver add attestations are required.');
    }
    const ownerDoc = await db.doc(`owner_operators/${ownerUser.uid}`).get();
    const companyName = ownerDoc.data()?.legalName || ownerDoc.data()?.companyName || 'A fleet';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://xtrafleet.com';

    const userAgent = req.headers.get('user-agent') ?? undefined;
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      undefined;

    // Collected across all drivers, then written to the owner doc once.
    const ownerAttestationEntries: ReturnType<typeof buildAttestationEntry>[] = [];

    const results = await Promise.allSettled(
      drivers.map(async (driver) => {
        const existing = await db.collection('driver_invitations')
          .where('email', '==', driver.email.toLowerCase())
          .where('status', '==', 'pending')
          .limit(1)
          .get();

        if (!existing.empty) throw new Error(`${driver.email} already invited`);

        const token = crypto.randomUUID();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        // DEV-154 phase 3: build the 3 attestation entries against this
        // invitation. Driver doesn't have a uid yet, so we bind via
        // driverInvitationToken + driverInvitationEmail.
        const entries = DRIVER_ADD_ATTESTATIONS.map(type =>
          buildAttestationEntry(type, ownerUser.uid, {
            ip,
            userAgent,
            context: {
              driverInvitationToken: token,
              driverInvitationEmail: driver.email.toLowerCase(),
            },
          }),
        );
        ownerAttestationEntries.push(...entries);

        await db.collection('driver_invitations').doc(token).set({
          email: driver.email.toLowerCase(),
          firstName: driver.firstName,
          lastName: driver.lastName,
          ownerId: ownerUser.uid,
          ownerCompanyName: companyName,
          // Snapshot of attestations captured for this specific invitation
          // — duplicated on the owner doc but kept here so audits of an
          // invitation are self-contained.
          attestations: entries,
          createdAt: FieldValue.serverTimestamp(),
          expiresAt: Timestamp.fromDate(expiresAt),
          status: 'pending',
        });

        if (resend) {
          const inviteLink = `${baseUrl}/driver-register?token=${token}`;
          await resend.emails.send({
            from: 'XtraFleet <noreply@xtrafleet.com>',
            to: [driver.email],
            subject: `Join ${companyName} on XtraFleet`,
            html: `<!DOCTYPE html><html><body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #4F46E5;">${driver.firstName}, You're Invited!</h1>
              <p><strong>${driver.firstName}</strong>, you are being invited to complete your driver profile for short-term leasing opportunities with <strong>${companyName}</strong>.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${inviteLink}" style="display: inline-block; padding: 14px 28px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">Start Driver Profile</a>
              </div>
              <p style="color: #666; font-size: 14px;">This invitation expires in 7 days.</p>
              </body></html>`,
          });
        }

        return { email: driver.email, status: 'success' };
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected');

    if (failed.length > 0) {
      console.error('[Bulk Invite] Some invitations failed:', failed);
    }

    // Append the collected attestations to the owner's unified array.
    // Non-blocking — invitations have already been persisted by this point.
    if (ownerAttestationEntries.length > 0) {
      try {
        await db.doc(`owner_operators/${ownerUser.uid}`).update({
          attestations: FieldValue.arrayUnion(...ownerAttestationEntries),
        });
      } catch (err) {
        console.error('[Bulk Invite] Failed to record owner attestations:', err);
      }
    }

    return handleApiSuccess({ 
      successful,
      failed: failed.length,
      message: `${successful} invitation${successful !== 1 ? 's' : ''} sent successfully!`
    }, 201);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage === 'Unauthorized') {
      return handleApiError('unauthorized', error instanceof Error ? error : new Error(errorMessage), {
        endpoint: 'POST /api/add-drivers-bulk'
      });
    }
    return handleApiError('server', error instanceof Error ? error : new Error(errorMessage), {
      endpoint: 'POST /api/add-drivers-bulk'
    });
  }
}

export const POST = withCors(handlePost);
