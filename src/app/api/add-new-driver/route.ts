import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getFirebaseAdmin, FieldValue, Timestamp } from '@/lib/firebase-admin-singleton';
import { handleApiError, handleApiSuccess } from '@/lib/api-error-handler';
import { withCors } from '@/lib/api-cors';
import { rateLimiters, getIdentifier, formatTimeRemaining } from '@/lib/rate-limit';
import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY 
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const inviteSchema = z.object({
  email: z.string().email('Invalid email address'),
  driverType: z.enum(['existing', 'newHire'], {
    errorMap: () => ({ message: 'Driver type must be either "existing" or "newHire"' })
  }),
  hasConfirmedDQF: z.boolean({
    required_error: 'DQF confirmation is required',
    invalid_type_error: 'DQF confirmation must be a boolean'
  }),
}).refine((data) => {
  // If driver type is "existing", hasConfirmedDQF must be true
  if (data.driverType === 'existing' && data.hasConfirmedDQF !== true) {
    return false;
  }
  // For new hires, hasConfirmedDQF can be any boolean (we expect true)
  return true;
}, {
  message: 'Must confirm DQF on file for existing drivers',
  path: ['hasConfirmedDQF'],
});

/**
 * Verify token - handles both ID tokens and session cookies
 */
async function verifyToken(auth: any, tokenValue: string) {
  // Try verifying as session cookie first (most common for logged-in users)
  try {
    return await auth.verifySessionCookie(tokenValue, true);
  } catch (sessionError) {
    // If that fails, try as regular ID token
    try {
      return await auth.verifyIdToken(tokenValue);
    } catch (idTokenError) {
      throw new Error('Invalid authentication token');
    }
  }
}

async function handlePost(req: NextRequest) {
  try {
    console.log('[Invite Driver] Request received');
    
    // Get Firebase Admin
    const { auth, db } = await getFirebaseAdmin();
    
    // Get token from cookie
    const token = req.cookies.get('fb-id-token');
    if (!token) {
      throw new Error('Unauthorized');
    }

    // Verify token (handles both session cookies and ID tokens)
    const ownerUser = await verifyToken(auth, token.value);
    console.log('[Invite Driver] User authenticated:', ownerUser.uid);

    // Apply rate limiting AFTER auth (with user ID)
    const identifier = getIdentifier(req, ownerUser.uid);
    const { success, reset } = await rateLimiters.invitations.limit(identifier);

    if (!success) {
      return NextResponse.json(
        {
          error: 'Too many invitation requests',
          message: `You can send more invitations in ${formatTimeRemaining(reset)}`,
        },
        { status: 429 }
      );
    }

    // Parse and validate request body
    const body = await req.json();
    console.log('[Invite Driver] Request body:', JSON.stringify(body));
    
    const validation = inviteSchema.safeParse(body);

    if (!validation.success) {
      console.error('[Invite Driver] Validation failed:', validation.error);
      const errorMessage = Object.values(validation.error.flatten().fieldErrors).flat().join(', ');
      throw new Error(errorMessage);
    }

    const { email, driverType, hasConfirmedDQF } = validation.data;
    const ownerOperatorId = ownerUser.uid;

    console.log('[Invite Driver] Validated data:', { email, driverType, hasConfirmedDQF });

    // Check if invitation already exists
    const existingInvite = await db.collection('driver_invitations')
      .where('email', '==', email)
      .where('status', '==', 'pending')
      .limit(1)
      .get();
    
    if (!existingInvite.empty) {
      throw new Error('Invitation already sent');
    }

    // Get owner info
    console.log('[Invite Driver] Fetching owner info:', ownerOperatorId);
    const ownerDoc = await db.doc('owner_operators/' + ownerOperatorId).get();
    const ownerData = ownerDoc.data();
    const companyName = ownerData?.legalName || ownerData?.companyName || 'A fleet';

    // Create invitation token
    const invitationToken = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    console.log('[Invite Driver] Creating invitation token');

    // Save invitation to Firestore with driver type
    await db.collection('driver_invitations').doc(invitationToken).set({
      email: email,
      ownerId: ownerOperatorId,
      ownerCompanyName: companyName,
      driverType: driverType,
      ...(driverType === 'existing' && { hasConfirmedDQF }),
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromDate(expiresAt),
      status: 'pending',
    });

    console.log('[Invite Driver] Invitation saved to Firestore');

    // Build invitation link
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://xtrafleet.com';
    const inviteLink = baseUrl + '/driver-register?token=' + invitationToken;

    // Send invitation email
    if (!resend) {
      console.warn('[Invite Driver] Email service not configured');
      return handleApiSuccess({ 
        id: invitationToken, 
        message: 'Invitation created (email service not configured).',
        inviteLink: inviteLink 
      }, 201);
    }

    console.log('[Invite Driver] Sending email to:', email);

    // Customize email based on driver type
    const emailSubject = driverType === 'newHire' 
      ? `Welcome to ${companyName} - Complete Your Driver Profile`
      : `Invitation to Join ${companyName} on XtraFleet`;

    const emailContent = driverType === 'newHire'
      ? `<p><strong>${companyName}</strong> has hired you as a new driver!</p>
         <p>Click the button below to create your profile and complete your Driver Qualification File (DQF):</p>`
      : `<p><strong>${companyName}</strong> has invited you to join their fleet on XtraFleet.</p>
         <p>Click the button below to create your driver profile:</p>`;

    const { error: emailError } = await resend.emails.send({
      from: 'XtraFleet <noreply@xtrafleet.com>',
      to: [email],
      subject: emailSubject,
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #4F46E5;">You're Invited to XtraFleet!</h1>
        ${emailContent}
        <div style="text-align: center; margin: 30px 0;">
        <a href="${inviteLink}" style="display: inline-block; padding: 14px 28px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">Create Your Profile</a>
        </div>
        <p style="color: #666; font-size: 14px;">This invitation expires in 7 days.</p>
        <p style="color: #666; font-size: 12px;">Or copy this link: ${inviteLink}</p>
        </body></html>`,
    });

    if (emailError) {
      console.error('[Invite Driver] Email failed:', emailError);
      await db.collection('driver_invitations').doc(invitationToken).delete();
      throw new Error('Email send failed');
    }

    console.log('[Invite Driver] Invitation sent successfully');
    
    return handleApiSuccess({ 
      id: invitationToken, 
      message: 'Invitation sent successfully!' 
    }, 201);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Categorize errors
    if (errorMessage === 'Unauthorized' || errorMessage === 'Invalid authentication token') {
      return handleApiError('unauthorized', error instanceof Error ? error : new Error(errorMessage), {
        endpoint: 'POST /api/add-new-driver'
      });
    }
    
    if (errorMessage.includes('Invalid email') || errorMessage.includes('email address') || errorMessage.includes('Driver type') || errorMessage.includes('DQF')) {
      return handleApiError('validation', error instanceof Error ? error : new Error(errorMessage), {
        endpoint: 'POST /api/add-new-driver'
      });
    }
    
    if (errorMessage === 'Invitation already sent') {
      return handleApiError('conflict', error instanceof Error ? error : new Error(errorMessage), {
        endpoint: 'POST /api/add-new-driver'
      });
    }
    
    if (errorMessage === 'Email send failed') {
      return handleApiError('network', error instanceof Error ? error : new Error(errorMessage), {
        endpoint: 'POST /api/add-new-driver'
      });
    }
    
    // Generic server error
    return handleApiError('server', error instanceof Error ? error : new Error(errorMessage), {
      endpoint: 'POST /api/add-new-driver'
    });
  }
}

// Export with CORS protection
export const POST = withCors(handlePost);
