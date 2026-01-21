'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { authenticateServerAction } from '@/lib/api-auth';
import { getFirebaseAdmin, FieldValue, Timestamp } from '@/lib/firebase-admin-singleton';
import { z } from 'zod';
import Stripe from 'stripe';
import { Resend } from 'resend';
import {
  sendOwnerRegistrationEmail,
  sendDriverInvitationConfirmationEmail
} from '@/lib/email';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const resend = process.env.RESEND_API_KEY 
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const updateProfileSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  contactEmail: z.string().email("Invalid email address"),
  mcNumber: z.string().optional(),
  dotNumber: z.string().optional(),
});


// ==================== COMPANY PROFILE ACTIONS ====================

export async function createCompanyProfile(formData: FormData) {
  const user = await authenticateServerAction();
  if (!user) {
    redirect('/login?error=unauthorized');
  }
  
  const contactEmail = formData.get('contactEmail') as string || user.email || '';
  const companyName = formData.get('legalName') as string || '';
  
  const profileData = {
      id: user.uid,
      legalName: companyName,
      contactEmail: contactEmail,
      dba: formData.get('dba'),
      phone: formData.get('phone') || '',
      dotNumber: formData.get('dotNumber'),
      mcNumber: formData.get('mcNumber'),
      ein: formData.get('ein'),
      hqAddress: formData.get('hqAddress'),
      loadLocation: formData.get('loadLocation'),
      serviceRegions: formData.get('serviceRegions'),
  };
  
  try {
      const { db } = await getFirebaseAdmin();
      const ownerDocRef = db.collection('owner_operators').doc(user.uid);
      await ownerDocRef.set(profileData, { merge: true });
      
      // Send welcome email to new owner operator
      if (contactEmail) {
        await sendOwnerRegistrationEmail(contactEmail, companyName).catch(err => {
          console.error('Failed to send welcome email:', err);
        });
      }
      
  } catch (error) {
      console.error('Failed to update company profile:', error);
      redirect('/create-profile?error=Failed+to+save+profile');
  }

  revalidatePath('/dashboard/getting-started');
  
  if (process.env.STRIPE_SECRET_KEY) {
    redirect('/payment');
  } else {
    redirect('/dashboard/getting-started');
  }
}

export async function updateCompanyProfile(values: unknown): Promise<{ error?: string; message?: string }> {
  const user = await authenticateServerAction();
  if (!user) {
    return { error: 'You must be logged in to update your profile.' };
  }

  const validation = updateProfileSchema.safeParse(values);
  if (!validation.success) {
    return { error: 'Invalid data submitted.' };
  }

  try {
    const { db } = await getFirebaseAdmin();
    const ownerDocRef = db.collection('owner_operators').doc(user.uid);
    
    const dataToSave = {
      ...validation.data,
      id: user.uid
    };
    
    await ownerDocRef.set(dataToSave, { merge: true });
    
    revalidatePath('/dashboard/settings');
    revalidatePath('/dashboard/getting-started');
    return { message: 'Profile updated successfully.' };
  } catch (error: any) {
    console.error('Failed to update company profile:', error);
    return { error: 'An unexpected error occurred while saving your profile.' };
  }
}

// ==================== PAYMENT ACTIONS ====================

export async function createPaymentIntent(): Promise<string | { error: string }> {
  if (!process.env.STRIPE_SECRET_KEY || !stripe) {
    const errorMessage =
      'Stripe has not been configured. Missing STRIPE_SECRET_KEY.';
    console.error(errorMessage);
    return { error: errorMessage };
  }
  
  const user = await authenticateServerAction();
  if (!user) {
      return { error: 'You must be logged in to create a payment intent.' };
  }

  try {
    const setupIntent = await stripe.setupIntents.create({
        usage: 'on_session',
        metadata: {
            firebase_uid: user.uid,
        },
    });

    return setupIntent.client_secret!;
  } catch (e: any) {
    console.error('Stripe Error:', e.message);
    return { error: 'Failed to create Payment Intent. ' + e.message };
  }
}

export async function handleSuccessfulPaymentSetup(setupIntentId: string) {
    if (!stripe) {
        throw new Error('Stripe is not configured.');
    }
    const user = await authenticateServerAction();
    if (!user) {
        throw new Error('User not authenticated.');
    }

    try {
        const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
        if (setupIntent.status === 'succeeded' && setupIntent.metadata?.firebase_uid === user.uid) {
            const { db } = await getFirebaseAdmin();
            const ownerDocRef = db.collection('owner_operators').doc(user.uid);
            
            await ownerDocRef.set({
                subscriptionStatus: 'active',
                stripeCustomerId: setupIntent.customer,
                stripePaymentMethodId: setupIntent.payment_method,
            }, { merge: true });
            
            revalidatePath('/dashboard/getting-started');
            return { success: true };
        } else {
            throw new Error('SetupIntent not succeeded or UID mismatch.');
        }
    } catch (error: any) {
        console.error("Failed to handle successful payment setup:", error);
        return { success: false, error: error.message };
    }
}

// ==================== PASSWORD RESET ====================

export async function sendPasswordReset(
  prevState: { message: string; error: string },
  formData: FormData
): Promise<{ message: string; error: string }> {
  const email = formData.get('email') as string;

  if (!email) {
    return {
      message: '',
      error: 'Please enter your email address.',
    };
  }

  try {
    const { auth } = await getFirebaseAdmin();

    // Generate the Firebase reset link (this goes to Firebase's default handler)
    const firebaseResetLink = await auth.generatePasswordResetLink(email, {
      url: 'https://xtrafleet.com/login',
    });

    // Extract the oobCode from Firebase's link and construct our custom URL
    const firebaseUrl = new URL(firebaseResetLink);
    const oobCode = firebaseUrl.searchParams.get('oobCode');
    const apiKey = firebaseUrl.searchParams.get('apiKey');

    if (!oobCode) {
      throw new Error('Failed to generate reset code');
    }

    // Construct our custom reset URL pointing to xtrafleet.com
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://xtrafleet.com';
    const resetLink = `${baseUrl}/auth/action?mode=resetPassword&oobCode=${oobCode}&apiKey=${apiKey}`;

    if (!resend) {
      console.error('Resend not configured, but reset link generated:', resetLink);
      return {
        message: 'If an account exists for this email, a reset link has been sent.',
        error: '',
      };
    }

    const { error: emailError } = await resend.emails.send({
      from: 'XtraFleet <noreply@xtrafleet.com>',
      to: [email],
      subject: 'Reset Your XtraFleet Password',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #1a1a1a; font-size: 24px; margin: 0;">XtraFleet</h1>
            </div>
            
            <h2 style="color: #1a1a1a; font-size: 20px;">Reset Your Password</h2>
            
            <p>We received a request to reset your password. Click the button below to create a new password:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" style="display: inline-block; padding: 14px 28px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
                Reset Password
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px;">This link will expire in 1 hour for security reasons.</p>
            
            <p style="color: #666; font-size: 14px;">If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.</p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            
            <p style="color: #999; font-size: 12px; text-align: center;">
              If the button doesn't work, copy and paste this link into your browser:<br>
              <a href="${resetLink}" style="color: #4F46E5; word-break: break-all;">${resetLink}</a>
            </p>
          </body>
        </html>
      `,
    });

    if (emailError) {
      console.error('Failed to send password reset email:', emailError);
      return {
        message: 'If an account exists for this email, a reset link has been sent.',
        error: '',
      };
    }

    console.log('✅ Password reset email sent to:', email);

    return {
      message: 'If an account exists for this email, a reset link has been sent.',
      error: '',
    };
  } catch (e: any) {
    console.error('Password reset error:', e);
    
    if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-email') {
      return {
        message: 'If an account exists for this email, a reset link has been sent.',
        error: '',
      };
    }
    
    return {
      message: 'If an account exists for this email, a reset link has been sent.',
      error: '',
    };
  }
}

// ==================== DRIVER INVITATION ====================

export interface AddDriverState {
  message: string;
  error: string;
}

export async function inviteDriver(
  prevState: AddDriverState,
  formData: FormData
): Promise<AddDriverState> {
  try {
    console.log('🔵 inviteDriver called');
    
    const user = await authenticateServerAction();
    
    if (!user) {
      console.log('❌ No authenticated user');
      return {
        message: '',
        error: 'You must be logged in to invite a driver.',
      };
    }

    console.log('✅ User authenticated:', user.uid);

    const email = formData.get('email') as string;
    
    if (!email) {
      return {
        message: '',
        error: 'Email is required.',
      };
    }

    console.log('📧 Sending invitation to:', email);

    if (!resend) {
      console.error('❌ Resend not configured');
      return {
        message: '',
        error: 'Email service not configured. Please contact support.',
      };
    }

    const invitationToken = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Get owner info for confirmation email
    let ownerEmail = user.email || '';
    let companyName = '';
    
    try {
      const { db } = await getFirebaseAdmin();

      // Get owner data
      const ownerDoc = await db.collection('owner_operators').doc(user.uid).get();
      if (ownerDoc.exists) {
        const ownerData = ownerDoc.data();
        ownerEmail = ownerData?.contactEmail || user.email || '';
        companyName = ownerData?.legalName || ownerData?.companyName || '';
      }

      // Save invitation
      await db.collection('driver_invitations').doc(invitationToken).set({
        email: email,
        ownerId: user.uid,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromDate(expiresAt),
        status: 'pending',
      });

      console.log('✅ Invitation saved to Firestore');
    } catch (dbError) {
      console.error('❌ Database error:', dbError);
      return {
        message: '',
        error: 'Failed to create invitation.',
      };
    }

    const invitationLink = `https://xtrafleet.com/driver-register?token=${invitationToken}`;
    
    // Send invitation email to driver
    const { data, error } = await resend.emails.send({
      from: 'XtraFleet <noreply@xtrafleet.com>',
      to: [email],
      subject: 'Invitation to Join XtraFleet',
      html: `
        <h1>You've been invited to join XtraFleet!</h1>
        <p>${companyName ? `<strong>${companyName}</strong> has invited you` : 'You have been invited'} to join their fleet on XtraFleet.</p>
        <p>Click the link below to create your driver profile:</p>
        <a href="${invitationLink}" style="display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;">
          Create Your Profile
        </a>
        <p style="color: #666; font-size: 14px;">This invitation expires in 7 days.</p>
        <p style="color: #666; font-size: 14px;">Or copy and paste this link: ${invitationLink}</p>
      `,
    });

    if (error) {
      console.error('❌ Resend error:', error);

      try {
        const { db: cleanupDb } = await getFirebaseAdmin();
        await cleanupDb.collection('driver_invitations').doc(invitationToken).delete();
      } catch (cleanupError) {
        console.error('Failed to cleanup invitation:', cleanupError);
      }

      return {
        message: '',
        error: `Failed to send invitation: ${error.message}`,
      };
    }

    console.log('✅ Invitation email sent successfully:', data);

    // Send confirmation email to owner
    if (ownerEmail) {
      await sendDriverInvitationConfirmationEmail(ownerEmail, email, companyName).catch(err => {
        console.error('Failed to send invitation confirmation to owner:', err);
      });
    }

    return {
      message: 'Invitation sent successfully!',
      error: '',
    };

  } catch (error: any) {
    console.error('❌ inviteDriver error:', error);
    return {
      message: '',
      error: error.message || 'An unexpected error occurred.',
    };
  }
}
