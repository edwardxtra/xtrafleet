import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser, initializeFirebaseAdmin } from '@/lib/firebase/server-auth';
import admin from 'firebase-admin';
import { handleError } from '@/lib/api-utils';
import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY 
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const inviteSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export async function POST(req: NextRequest) {
  const adminApp = await initializeFirebaseAdmin();
  if (!adminApp) {
    return handleError(new Error('Server misconfigured'), 'Server configuration error. Cannot connect to backend services.', 500);
  }

  try {
    const firestore = adminApp.firestore();
    
    const ownerUser = await getAuthenticatedUser(req as any);
    
    if (!ownerUser) {
      return handleError(new Error('Unauthorized'), 'You must be logged in to invite a driver.', 401);
    }

    const body = await req.json();
    const validation = inviteSchema.safeParse(body);

    if (!validation.success) {
      const fieldErrors = validation.error.flatten().fieldErrors;
      const errorMessage = Object.values(fieldErrors).flat().join(', ');
      return NextResponse.json({ error: errorMessage, fieldErrors }, { status: 400 });
    }

    const { email } = validation.data;
    const ownerOperatorId = ownerUser.uid;

    // Check if invitation already exists for this email
    const existingInvite = await firestore.collection('driver_invitations')
      .where('email', '==', email)
      .where('status', '==', 'pending')
      .limit(1)
      .get();
    
    if (!existingInvite.empty) {
      return handleError(new Error('Already invited'), 'An invitation has already been sent to this email.', 409);
    }

    // Get owner info
    const ownerDoc = await firestore.doc('owner_operators/' + ownerOperatorId).get();
    const ownerData = ownerDoc.data();
    const companyName = ownerData?.legalName || ownerData?.companyName || 'A fleet';

    // Create invitation token
    const invitationToken = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Save invitation to Firestore
    await firestore.collection('driver_invitations').doc(invitationToken).set({
      email: email,
      ownerId: ownerOperatorId,
      ownerCompanyName: companyName,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      status: 'pending',
    });

    // Build invitation link
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://xtrafleet.com';
    const inviteLink = baseUrl + '/driver-register?token=' + invitationToken;

    // Send invitation email
    if (!resend) {
      console.warn('Resend not configured. Invitation link:', inviteLink);
      return NextResponse.json({ 
        id: invitationToken, 
        message: 'Invitation created (email service not configured).',
        inviteLink: inviteLink 
      }, { status: 201 });
    }

    const { error: emailError } = await resend.emails.send({
      from: 'XtraFleet <noreply@xtrafleet.com>',
      to: [email],
      subject: 'Invitation to Join ' + companyName + ' on XtraFleet',
      html: '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">' +
        '<h1 style="color: #4F46E5;">You\'re Invited to XtraFleet!</h1>' +
        '<p><strong>' + companyName + '</strong> has invited you to join their fleet on XtraFleet.</p>' +
        '<p>Click the button below to create your driver profile:</p>' +
        '<div style="text-align: center; margin: 30px 0;">' +
        '<a href="' + inviteLink + '" style="display: inline-block; padding: 14px 28px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">Create Your Profile</a>' +
        '</div>' +
        '<p style="color: #666; font-size: 14px;">This invitation expires in 7 days.</p>' +
        '<p style="color: #666; font-size: 12px;">Or copy this link: ' + inviteLink + '</p>' +
        '</body></html>',
    });

    if (emailError) {
      console.error('Failed to send invitation email:', emailError);
      await firestore.collection('driver_invitations').doc(invitationToken).delete();
      return handleError(new Error('Email failed'), 'Failed to send invitation email. Please try again.', 500);
    }

    console.log('Invitation sent successfully to:', email);
    
    return NextResponse.json({ 
      id: invitationToken, 
      message: 'Invitation sent successfully!' 
    }, { status: 201 });

  } catch (error: any) {
    console.error('Add driver error:', error);
    return handleError(error, 'Failed to send invitation');
  }
}
