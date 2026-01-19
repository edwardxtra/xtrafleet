import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, handleApiSuccess } from '@/lib/api-error-handler';
import { withCors } from '@/lib/api-cors';
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

async function handlePost(request: NextRequest) {
  try {
    const { type, data } = await request.json();

    if (!type || !data) {
      throw new Error('Missing type or data');
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
        throw new Error(`Unknown notification type: ${type}`);
    }

    if (!result.success) {
      console.error(`[Notifications] Type ${type} failed:`, result.error);
      throw new Error(result.error || 'Failed to send notification');
    }

    return handleApiSuccess({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage.includes('Missing')) {
      return handleApiError('missingFields', error instanceof Error ? error : new Error(errorMessage), {
        endpoint: 'POST /api/notifications'
      });
    }
    
    if (errorMessage.includes('Unknown notification type')) {
      return handleApiError('validation', error instanceof Error ? error : new Error(errorMessage), {
        endpoint: 'POST /api/notifications'
      });
    }
    
    if (errorMessage.includes('send')) {
      return handleApiError('network', error instanceof Error ? error : new Error(errorMessage), {
        endpoint: 'POST /api/notifications'
      });
    }
    
    return handleApiError('server', error instanceof Error ? error : new Error(errorMessage), {
      endpoint: 'POST /api/notifications'
    });
  }
}

// Export with CORS protection
export const POST = withCors(handlePost);
