import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY 
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_EMAIL = 'XtraFleet <noreply@xtrafleet.com>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://xtrafleet.com';

function emailTemplate(content: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background-color: white; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 32px;">
            <img src="${APP_URL}/images/xtrafleet-logo-no-tagline.svg" alt="XtraFleet" style="height: 40px; width: auto;" />
          </div>
          ${content}
        </div>
        <div style="text-align: center; margin-top: 24px; color: #9ca3af; font-size: 12px;">
          <p>&copy; ${new Date().getFullYear()} XtraFleet Technologies, Inc. All rights reserved.</p>
          <p>Questions? Contact us at support@xtrafleet.com</p>
        </div>
      </body>
    </html>
  `;
}

function buttonStyle(): string {
  return 'display: inline-block; padding: 14px 28px; background-color: #1E9BD7; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;';
}

async function sendEmail(to: string, subject: string, html: string): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    console.warn('Resend not configured, email not sent:', { to, subject });
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html,
    });

    if (error) {
      console.error('Failed to send email:', error);
      return { success: false, error: error.message };
    }

    console.log('Email sent:', { to, subject });
    return { success: true };
  } catch (err: any) {
    console.error('Email error:', err);
    return { success: false, error: err.message };
  }
}

// ==================== REGISTRATION EMAIL (account creation only) ====================

export async function sendOwnerRegistrationEmail(email: string, companyName: string) {
  const subject = 'Welcome to XtraFleet! Your account has been created';
  const html = emailTemplate(`
    <h2 style="color: #1a1a1a; font-size: 20px; margin-bottom: 16px;">Welcome to XtraFleet!</h2>
    
    <p>Hi there,</p>
    
    <p>Your XtraFleet account has been created for <strong>${companyName || 'your company'}</strong>.</p>
    
    <p>To get started, complete your company profile &mdash; it only takes a few minutes:</p>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${APP_URL}/create-profile" style="${buttonStyle()}">
        Complete Your Profile
      </a>
    </div>
    
    <p style="color: #6b7280; font-size: 14px;">You'll need your DOT #, MC #, and insurance details to finish setup.</p>
  `);

  return sendEmail(email, subject, html);
}

// ==================== PROFILE COMPLETE EMAIL (after full profile submission) ====================

export async function sendOwnerProfileCompleteEmail(email: string, companyName: string) {
  const subject = "You're all set! Start using XtraFleet";
  const html = emailTemplate(`
    <h2 style="color: #1a1a1a; font-size: 20px; margin-bottom: 16px;">Your Profile is Complete!</h2>
    
    <p>Hi there,</p>
    
    <p>Great news &mdash; your company profile for <strong>${companyName || 'your company'}</strong> is now fully set up on XtraFleet.</p>
    
    <p>You're now ready to:</p>
    <ul style="color: #4b5563;">
      <li>Add and manage your drivers</li>
      <li>Create and track loads</li>
      <li>Match drivers with loads from other fleets</li>
      <li>Generate FMCSA-compliant Trip Lease Agreements</li>
    </ul>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${APP_URL}/dashboard" style="${buttonStyle()}">
        Go to Dashboard
      </a>
    </div>
    
    <p style="color: #6b7280; font-size: 14px;">Need help getting started? Check out our <a href="${APP_URL}/help" style="color: #1E9BD7;">Getting Started Guide</a>.</p>
  `);

  return sendEmail(email, subject, html);
}

// ==================== DRIVER EMAILS ====================

export async function sendDriverInvitationConfirmationEmail(
  ownerEmail: string, 
  driverEmail: string,
  companyName: string
) {
  const subject = 'Driver Invitation Sent';
  const html = emailTemplate(`
    <h2 style="color: #1a1a1a; font-size: 20px; margin-bottom: 16px;">Invitation Sent Successfully</h2>
    
    <p>You've invited a new driver to join ${companyName || 'your fleet'} on XtraFleet.</p>
    
    <div style="background-color: #f3f4f6; border-radius: 6px; padding: 16px; margin: 24px 0;">
      <p style="margin: 0; color: #4b5563;"><strong>Invited:</strong> ${driverEmail}</p>
      <p style="margin: 8px 0 0 0; color: #6b7280; font-size: 14px;">The invitation will expire in 7 days.</p>
    </div>
    
    <p>Once they complete their registration, they'll appear in your Drivers list.</p>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${APP_URL}/dashboard/drivers" style="${buttonStyle()}">
        View Drivers
      </a>
    </div>
  `);

  return sendEmail(ownerEmail, subject, html);
}

export async function sendDriverRegistrationCompleteEmail(
  ownerEmail: string,
  driverName: string,
  driverEmail: string
) {
  const subject = `New Driver Joined: ${driverName}`;
  const html = emailTemplate(`
    <h2 style="color: #1a1a1a; font-size: 20px; margin-bottom: 16px;">New Driver Registration Complete</h2>
    
    <p>Great news! A driver has completed their registration and joined your fleet.</p>
    
    <div style="background-color: #ecfdf5; border-radius: 6px; padding: 16px; margin: 24px 0; border-left: 4px solid #10b981;">
      <p style="margin: 0; color: #065f46;"><strong>${driverName}</strong></p>
      <p style="margin: 4px 0 0 0; color: #047857; font-size: 14px;">${driverEmail}</p>
    </div>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${APP_URL}/dashboard/drivers" style="${buttonStyle()}">
        View Driver Profile
      </a>
    </div>
  `);

  return sendEmail(ownerEmail, subject, html);
}

export async function sendDriverWelcomeEmail(driverEmail: string, driverName: string) {
  const subject = 'Welcome to XtraFleet, Driver!';
  const html = emailTemplate(`
    <h2 style="color: #1a1a1a; font-size: 20px; margin-bottom: 16px;">Welcome to XtraFleet!</h2>
    
    <p>Hi ${driverName},</p>
    
    <p>Your driver account has been created successfully. You're now part of the XtraFleet network!</p>
    
    <p>What you can do:</p>
    <ul style="color: #4b5563;">
      <li>View and update your profile</li>
      <li>Upload compliance documents (CDL, Medical Card, etc.)</li>
      <li>See your assigned loads</li>
      <li>Track your trips</li>
    </ul>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${APP_URL}/driver-dashboard" style="${buttonStyle()}">
        Go to Your Dashboard
      </a>
    </div>
  `);

  return sendEmail(driverEmail, subject, html);
}

// ==================== MATCH EMAILS ====================

export async function sendMatchRequestEmail(
  driverOwnerEmail: string, driverOwnerName: string, driverName: string,
  loadOrigin: string, loadDestination: string, rate: number, matchId: string
) {
  const subject = `New Match Request for ${driverName}`;
  const html = emailTemplate(`
    <h2 style="color: #1a1a1a; font-size: 20px; margin-bottom: 16px;">New Match Request</h2>
    <p>Hi ${driverOwnerName || 'there'},</p>
    <p>Another fleet has requested to hire your driver for a trip.</p>
    <div style="background-color: #f3f4f6; border-radius: 6px; padding: 20px; margin: 24px 0;">
      <p style="margin: 4px 0; color: #4b5563;"><strong>Driver:</strong> ${driverName}</p>
      <p style="margin: 4px 0; color: #4b5563;"><strong>Route:</strong> ${loadOrigin} &rarr; ${loadDestination}</p>
      <p style="margin: 4px 0; color: #059669; font-size: 18px;"><strong>Rate: $${rate.toLocaleString()}</strong></p>
    </div>
    <p>You have <strong>48 hours</strong> to respond.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${APP_URL}/dashboard/incoming-matches" style="${buttonStyle()}">View Request</a>
    </div>
  `);
  return sendEmail(driverOwnerEmail, subject, html);
}

export async function sendDriverOfferRequestEmail(
  loadOwnerEmail: string, loadOwnerName: string, driverOwnerName: string, driverName: string,
  loadOrigin: string, loadDestination: string, rate: number, matchId: string
) {
  const subject = `Driver Offer for Your Load: ${loadOrigin} \u2192 ${loadDestination}`;
  const html = emailTemplate(`
    <h2 style="color: #1a1a1a; font-size: 20px; margin-bottom: 16px;">New Driver Offer</h2>
    <p>Hi ${loadOwnerName || 'there'},</p>
    <p><strong>${driverOwnerName}</strong> has offered their driver for your load.</p>
    <div style="background-color: #f3f4f6; border-radius: 6px; padding: 20px; margin: 24px 0;">
      <p style="margin: 4px 0; color: #4b5563;"><strong>Driver:</strong> ${driverName}</p>
      <p style="margin: 4px 0; color: #4b5563;"><strong>Route:</strong> ${loadOrigin} &rarr; ${loadDestination}</p>
      <p style="margin: 4px 0; color: #059669; font-size: 18px;"><strong>Proposed Rate: $${rate.toLocaleString()}</strong></p>
    </div>
    <p>You have <strong>48 hours</strong> to respond.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${APP_URL}/dashboard/incoming-matches" style="${buttonStyle()}">View Offer</a>
    </div>
  `);
  return sendEmail(loadOwnerEmail, subject, html);
}

export async function sendMatchAcceptedEmail(
  loadOwnerEmail: string, loadOwnerName: string, driverName: string,
  loadOrigin: string, loadDestination: string, rate: number, tlaId: string
) {
  const subject = 'Match Accepted - TLA Ready to Sign';
  const html = emailTemplate(`
    <h2 style="color: #1a1a1a; font-size: 20px; margin-bottom: 16px;">Match Accepted!</h2>
    <p>Hi ${loadOwnerName || 'there'},</p>
    <p>Great news! Your match request has been accepted.</p>
    <div style="background-color: #ecfdf5; border-radius: 6px; padding: 20px; margin: 24px 0; border-left: 4px solid #10b981;">
      <p style="margin: 4px 0; color: #047857;"><strong>Driver:</strong> ${driverName}</p>
      <p style="margin: 4px 0; color: #047857;"><strong>Route:</strong> ${loadOrigin} &rarr; ${loadDestination}</p>
      <p style="margin: 4px 0; color: #059669; font-size: 18px;"><strong>Rate: $${rate.toLocaleString()}</strong></p>
    </div>
    <p>A Trip Lease Agreement (TLA) has been generated and is waiting for signatures.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${APP_URL}/dashboard/tla/${tlaId}" style="${buttonStyle()}">Review &amp; Sign TLA</a>
    </div>
  `);
  return sendEmail(loadOwnerEmail, subject, html);
}

export async function sendMatchDeclinedEmail(
  loadOwnerEmail: string, loadOwnerName: string, driverName: string,
  loadOrigin: string, loadDestination: string, reason?: string
) {
  const subject = 'Match Request Declined';
  const html = emailTemplate(`
    <h2 style="color: #1a1a1a; font-size: 20px; margin-bottom: 16px;">Match Request Declined</h2>
    <p>Hi ${loadOwnerName || 'there'},</p>
    <p>Unfortunately, your match request was declined.</p>
    <div style="background-color: #fef2f2; border-radius: 6px; padding: 20px; margin: 24px 0; border-left: 4px solid #ef4444;">
      <p style="margin: 4px 0; color: #991b1b;"><strong>Driver:</strong> ${driverName}</p>
      <p style="margin: 4px 0; color: #991b1b;"><strong>Route:</strong> ${loadOrigin} &rarr; ${loadDestination}</p>
      ${reason ? `<p style="margin: 12px 0 0 0; color: #7f1d1d;"><strong>Reason:</strong> ${reason}</p>` : ''}
    </div>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${APP_URL}/dashboard/matches" style="${buttonStyle()}">Find More Drivers</a>
    </div>
  `);
  return sendEmail(loadOwnerEmail, subject, html);
}

export async function sendMatchCounteredEmail(
  loadOwnerEmail: string, loadOwnerName: string, driverName: string,
  loadOrigin: string, loadDestination: string, originalRate: number, counterRate: number, counterNotes?: string
) {
  const subject = 'Counter Offer Received';
  const html = emailTemplate(`
    <h2 style="color: #1a1a1a; font-size: 20px; margin-bottom: 16px;">Counter Offer Received</h2>
    <p>Hi ${loadOwnerName || 'there'},</p>
    <div style="background-color: #fffbeb; border-radius: 6px; padding: 20px; margin: 24px 0; border-left: 4px solid #f59e0b;">
      <p style="margin: 4px 0; color: #92400e;"><strong>Driver:</strong> ${driverName}</p>
      <p style="margin: 4px 0; color: #92400e;"><strong>Route:</strong> ${loadOrigin} &rarr; ${loadDestination}</p>
      <p style="margin: 12px 0 4px 0; color: #78350f;"><strong>Original:</strong> <span style="text-decoration: line-through;">$${originalRate.toLocaleString()}</span></p>
      <p style="margin: 4px 0; color: #059669; font-size: 18px;"><strong>Counter: $${counterRate.toLocaleString()}</strong></p>
      ${counterNotes ? `<p style="margin: 12px 0 0 0; color: #78350f;"><strong>Message:</strong> ${counterNotes}</p>` : ''}
    </div>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${APP_URL}/dashboard/matches" style="${buttonStyle()}">Review Counter Offer</a>
    </div>
  `);
  return sendEmail(loadOwnerEmail, subject, html);
}

// ==================== TLA EMAILS ====================

export async function sendTLAReadyForSignatureEmail(
  recipientEmail: string, recipientName: string, role: 'lessor' | 'lessee',
  driverName: string, loadOrigin: string, loadDestination: string, rate: number, tlaId: string
) {
  const roleLabel = role === 'lessor' ? 'Driver Provider (Lessor)' : 'Hiring Carrier (Lessee)';
  const subject = 'TLA Ready for Your Signature';
  const html = emailTemplate(`
    <h2 style="color: #1a1a1a; font-size: 20px; margin-bottom: 16px;">TLA Ready for Signature</h2>
    <p>Hi ${recipientName || 'there'},</p>
    <p>A Trip Lease Agreement is ready for your signature as the <strong>${roleLabel}</strong>.</p>
    <div style="background-color: #f3f4f6; border-radius: 6px; padding: 20px; margin: 24px 0;">
      <p style="margin: 4px 0; color: #4b5563;"><strong>Driver:</strong> ${driverName}</p>
      <p style="margin: 4px 0; color: #4b5563;"><strong>Route:</strong> ${loadOrigin} &rarr; ${loadDestination}</p>
      <p style="margin: 4px 0; color: #059669; font-size: 18px;"><strong>Rate: $${rate.toLocaleString()}</strong></p>
    </div>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${APP_URL}/dashboard/tla/${tlaId}" style="${buttonStyle()}">Review &amp; Sign TLA</a>
    </div>
  `);
  return sendEmail(recipientEmail, subject, html);
}

export async function sendTLAFullySignedEmail(
  recipientEmail: string, recipientName: string, driverName: string,
  loadOrigin: string, loadDestination: string, rate: number, tlaId: string
) {
  const subject = 'TLA Signed - Trip Ready to Begin';
  const html = emailTemplate(`
    <h2 style="color: #1a1a1a; font-size: 20px; margin-bottom: 16px;">TLA Fully Signed!</h2>
    <p>Hi ${recipientName || 'there'},</p>
    <p>The Trip Lease Agreement has been signed by both parties. The trip can now begin!</p>
    <div style="background-color: #ecfdf5; border-radius: 6px; padding: 20px; margin: 24px 0; border-left: 4px solid #10b981;">
      <p style="margin: 4px 0; color: #047857;"><strong>Driver:</strong> ${driverName}</p>
      <p style="margin: 4px 0; color: #047857;"><strong>Route:</strong> ${loadOrigin} &rarr; ${loadDestination}</p>
      <p style="margin: 4px 0; color: #059669; font-size: 18px;"><strong>Rate: $${rate.toLocaleString()}</strong></p>
    </div>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${APP_URL}/dashboard/tla/${tlaId}" style="${buttonStyle()}">View Signed TLA</a>
    </div>
    <p style="color: #6b7280; font-size: 14px;">Retain this agreement for at least 3 years per FMCSA regulations.</p>
  `);
  return sendEmail(recipientEmail, subject, html);
}

// ==================== TRIP EMAILS ====================

export async function sendTripStartedEmail(
  recipientEmail: string, recipientName: string, driverName: string,
  loadOrigin: string, loadDestination: string, rate: number, tlaId: string, startedByName: string
) {
  const subject = `Trip Started: ${loadOrigin} \u2192 ${loadDestination}`;
  const html = emailTemplate(`
    <h2 style="color: #1a1a1a; font-size: 20px; margin-bottom: 16px;">Trip Has Started!</h2>
    <p>Hi ${recipientName || 'there'},</p>
    <div style="background-color: #eff6ff; border-radius: 6px; padding: 20px; margin: 24px 0; border-left: 4px solid #3b82f6;">
      <p style="margin: 4px 0; color: #1e3a8a;"><strong>Driver:</strong> ${driverName}</p>
      <p style="margin: 4px 0; color: #1e3a8a;"><strong>Route:</strong> ${loadOrigin} &rarr; ${loadDestination}</p>
      <p style="margin: 4px 0; color: #1e3a8a;"><strong>Started By:</strong> ${startedByName}</p>
      <p style="margin: 4px 0; color: #059669; font-size: 18px;"><strong>Rate: $${rate.toLocaleString()}</strong></p>
    </div>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${APP_URL}/dashboard/tla/${tlaId}" style="${buttonStyle()}">View Trip Details</a>
    </div>
  `);
  return sendEmail(recipientEmail, subject, html);
}

export async function sendTripCompletedEmail(
  recipientEmail: string, recipientName: string, driverName: string,
  loadOrigin: string, loadDestination: string, rate: number, tlaId: string,
  endedByName: string, tripDuration: string
) {
  const subject = `Trip Completed: ${loadOrigin} \u2192 ${loadDestination}`;
  const html = emailTemplate(`
    <h2 style="color: #1a1a1a; font-size: 20px; margin-bottom: 16px;">Trip Completed!</h2>
    <p>Hi ${recipientName || 'there'},</p>
    <div style="background-color: #f5f3ff; border-radius: 6px; padding: 20px; margin: 24px 0; border-left: 4px solid #8b5cf6;">
      <p style="margin: 4px 0; color: #6d28d9;"><strong>Driver:</strong> ${driverName}</p>
      <p style="margin: 4px 0; color: #6d28d9;"><strong>Route:</strong> ${loadOrigin} &rarr; ${loadDestination}</p>
      <p style="margin: 4px 0; color: #6d28d9;"><strong>Duration:</strong> ${tripDuration}</p>
      <p style="margin: 4px 0; color: #6d28d9;"><strong>Completed By:</strong> ${endedByName}</p>
      <p style="margin: 12px 0 0 0; color: #059669; font-size: 20px;"><strong>Payment Due: $${rate.toLocaleString()}</strong></p>
    </div>
    <p>Thank you for using XtraFleet!</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${APP_URL}/dashboard/tla/${tlaId}" style="${buttonStyle()}">View Trip Details</a>
    </div>
  `);
  return sendEmail(recipientEmail, subject, html);
}
