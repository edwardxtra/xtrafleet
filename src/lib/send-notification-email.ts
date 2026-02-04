import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

interface DriverProfileSubmittedEmailParams {
  ownerEmail: string;
  ownerName: string;
  driverName: string;
  driverId: string;
}

interface DriverConfirmedEmailParams {
  driverEmail: string;
  driverName: string;
  ownerCompanyName: string;
}

export async function sendDriverProfileSubmittedEmail(params: DriverProfileSubmittedEmailParams) {
  if (!resend) {
    console.warn('[Email] Resend not configured');
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://xtrafleet.com';
    const driverUrl = `${baseUrl}/dashboard/drivers`;

    const { error } = await resend.emails.send({
      from: 'XtraFleet <notifications@xtrafleet.com>',
      to: [params.ownerEmail],
      subject: `Driver Profile Submitted - ${params.driverName}`,
      html: `<!DOCTYPE html><html><body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #4F46E5;">Driver Profile Submitted</h1>
        <p>Hi ${params.ownerName},</p>
        <p><strong>${params.driverName}</strong> has submitted their driver profile and is awaiting your confirmation.</p>
        <div style="background: #F3F4F6; padding: 16px; border-radius: 8px; margin: 24px 0;">
          <p style="margin: 0; font-weight: 600;">Next Steps:</p>
          <ol style="margin: 8px 0 0 0; padding-left: 20px;">
            <li>Review the driver's CDL information</li>
            <li>Verify your records match the submitted data</li>
            <li>Confirm the driver to enable them for leasing</li>
          </ol>
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${driverUrl}" style="display: inline-block; padding: 14px 28px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
            Review Driver Profile
          </a>
        </div>
        <p style="color: #666; font-size: 12px; margin-top: 30px;">
          You're receiving this email because a driver in your fleet submitted their profile for confirmation.
        </p>
      </body></html>`,
    });

    if (error) {
      console.error('[Email] Failed to send driver profile submitted email:', error);
      return { success: false, error };
    }

    return { success: true };
  } catch (error) {
    console.error('[Email] Error sending driver profile submitted email:', error);
    return { success: false, error };
  }
}

export async function sendDriverConfirmedEmail(params: DriverConfirmedEmailParams) {
  if (!resend) {
    console.warn('[Email] Resend not configured');
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://xtrafleet.com';
    const dashboardUrl = `${baseUrl}/driver-dashboard`;

    const { error } = await resend.emails.send({
      from: 'XtraFleet <notifications@xtrafleet.com>',
      to: [params.driverEmail],
      subject: 'Your Driver Profile Has Been Confirmed',
      html: `<!DOCTYPE html><html><body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #10B981;">✅ Profile Confirmed!</h1>
        <p>Hi ${params.driverName},</p>
        <p>Great news! <strong>${params.ownerCompanyName}</strong> has confirmed your driver profile.</p>
        <div style="background: #D1FAE5; padding: 16px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #10B981;">
          <p style="margin: 0; color: #065F46; font-weight: 600;">You're now eligible for leasing opportunities!</p>
        </div>
        <p>You can now:</p>
        <ul>
          <li>View and accept load assignments</li>
          <li>Update your availability</li>
          <li>Manage your profile and preferences</li>
        </ul>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${dashboardUrl}" style="display: inline-block; padding: 14px 28px; background-color: #10B981; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
            Go to Dashboard
          </a>
        </div>
        <p style="color: #666; font-size: 12px; margin-top: 30px;">
          Welcome to XtraFleet! We're excited to have you on board.
        </p>
      </body></html>`,
    });

    if (error) {
      console.error('[Email] Failed to send driver confirmed email:', error);
      return { success: false, error };
    }

    return { success: true };
  } catch (error) {
    console.error('[Email] Error sending driver confirmed email:', error);
    return { success: false, error };
  }
}
