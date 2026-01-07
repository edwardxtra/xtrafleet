// Client-side notification helper

export async function sendNotification(
  type: string,
  data: Record<string, any>
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('/api/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type, data }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Notification failed:', error);
      return { success: false, error: error.error };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Notification error:', error);
    return { success: false, error: error.message };
  }
}

// Convenience methods
export const notify = {
  matchRequest: (data: {
    driverOwnerEmail: string;
    driverOwnerName: string;
    driverName: string;
    loadOrigin: string;
    loadDestination: string;
    rate: number;
    matchId: string;
  }) => sendNotification('match_request', data),

  matchAccepted: (data: {
    loadOwnerEmail: string;
    loadOwnerName: string;
    driverName: string;
    loadOrigin: string;
    loadDestination: string;
    rate: number;
    tlaId: string;
  }) => sendNotification('match_accepted', data),

  matchDeclined: (data: {
    loadOwnerEmail: string;
    loadOwnerName: string;
    driverName: string;
    loadOrigin: string;
    loadDestination: string;
    reason?: string;
  }) => sendNotification('match_declined', data),

  matchCountered: (data: {
    loadOwnerEmail: string;
    loadOwnerName: string;
    driverName: string;
    loadOrigin: string;
    loadDestination: string;
    originalRate: number;
    counterRate: number;
    counterNotes?: string;
  }) => sendNotification('match_countered', data),

  tlaReady: (data: {
    recipientEmail: string;
    recipientName: string;
    role: 'lessor' | 'lessee';
    driverName: string;
    loadOrigin: string;
    loadDestination: string;
    rate: number;
    tlaId: string;
  }) => sendNotification('tla_ready', data),

  tlaSigned: (data: {
    recipientEmail: string;
    recipientName: string;
    driverName: string;
    loadOrigin: string;
    loadDestination: string;
    rate: number;
    tlaId: string;
  }) => sendNotification('tla_signed', data),

  // NEW: Trip Started notification
  tripStarted: (data: {
    recipientEmail: string;
    recipientName: string;
    driverName: string;
    loadOrigin: string;
    loadDestination: string;
    rate: number;
    tlaId: string;
    startedByName: string;
  }) => sendNotification('trip_started', data),

  // NEW: Trip Completed notification
  tripCompleted: (data: {
    recipientEmail: string;
    recipientName: string;
    driverName: string;
    loadOrigin: string;
    loadDestination: string;
    rate: number;
    tlaId: string;
    endedByName: string;
    tripDuration: string;
  }) => sendNotification('trip_completed', data),

  driverRegistered: (data: {
    ownerEmail: string;
    driverName: string;
    driverEmail: string;
  }) => sendNotification('driver_registered', data),

  ownerRegistered: (data: {
    email: string;
    companyName: string;
  }) => sendNotification('owner_registered', data),
};