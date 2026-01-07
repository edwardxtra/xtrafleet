import { NextRequest, NextResponse } from 'next/server';
import {
  sendOwnerRegistrationEmail,
  sendDriverRegistrationCompleteEmail,
  sendMatchRequestEmail,
  sendMatchAcceptedEmail,
  sendMatchDeclinedEmail,
  sendMatchCounteredEmail,
  sendTLAReadyForSignatureEmail,
  sendTLAFullySignedEmail,
  sendTripStartedEmail,
  sendTripCompletedEmail,
} from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    const { type, data } = await request.json();

    if (!type || !data) {
      return NextResponse.json(
        { error: 'Missing type or data' },
        { status: 400 }
      );
    }

    let result: { success: boolean; error?: string };

    switch (type) {
      case 'owner_registered':
        result = await sendOwnerRegistrationEmail(data.email, data.companyName);
        break;

      case 'driver_registered':
        result = await sendDriverRegistrationCompleteEmail(
          data.ownerEmail,
          data.driverName,
          data.driverEmail
        );
        break;

      case 'match_request':
        result = await sendMatchRequestEmail(
          data.driverOwnerEmail,
          data.driverOwnerName,
          data.driverName,
          data.loadOrigin,
          data.loadDestination,
          data.rate,
          data.matchId
        );
        break;

      case 'match_accepted':
        result = await sendMatchAcceptedEmail(
          data.loadOwnerEmail,
          data.loadOwnerName,
          data.driverName,
          data.loadOrigin,
          data.loadDestination,
          data.rate,
          data.tlaId
        );
        break;

      case 'match_declined':
        result = await sendMatchDeclinedEmail(
          data.loadOwnerEmail,
          data.loadOwnerName,
          data.driverName,
          data.loadOrigin,
          data.loadDestination,
          data.reason
        );
        break;

      case 'match_countered':
        result = await sendMatchCounteredEmail(
          data.loadOwnerEmail,
          data.loadOwnerName,
          data.driverName,
          data.loadOrigin,
          data.loadDestination,
          data.originalRate,
          data.counterRate,
          data.counterNotes
        );
        break;

      case 'tla_ready':
        result = await sendTLAReadyForSignatureEmail(
          data.recipientEmail,
          data.recipientName,
          data.role,
          data.driverName,
          data.loadOrigin,
          data.loadDestination,
          data.rate,
          data.tlaId
        );
        break;

      case 'tla_signed':
        result = await sendTLAFullySignedEmail(
          data.recipientEmail,
          data.recipientName,
          data.driverName,
          data.loadOrigin,
          data.loadDestination,
          data.rate,
          data.tlaId
        );
        break;

      case 'trip_started':
        result = await sendTripStartedEmail(
          data.recipientEmail,
          data.recipientName,
          data.driverName,
          data.loadOrigin,
          data.loadDestination,
          data.rate,
          data.tlaId,
          data.startedByName
        );
        break;

      case 'trip_completed':
        result = await sendTripCompletedEmail(
          data.recipientEmail,
          data.recipientName,
          data.driverName,
          data.loadOrigin,
          data.loadDestination,
          data.rate,
          data.tlaId,
          data.endedByName,
          data.tripDuration
        );
        break;

      default:
        return NextResponse.json(
          { error: `Unknown notification type: ${type}` },
          { status: 400 }
        );
    }

    if (!result.success) {
      console.error(`Notification ${type} failed:`, result.error);
      return NextResponse.json(
        { error: result.error || 'Failed to send notification' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Notifications API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}