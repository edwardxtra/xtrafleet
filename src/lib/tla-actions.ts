import { Firestore, doc, updateDoc, getDoc, Timestamp } from "firebase/firestore";
import type { TLA, InsuranceOption } from "@/lib/data";
import { showSuccess, showError } from "@/lib/toast-utils";
import { notify } from "@/lib/notifications";
import { calculateTripDuration, formatTripDuration } from "@/lib/tla-utils";
import { captureSignatureAudit } from "@/lib/audit-utils";

export interface SignTLAParams {
  firestore: Firestore;
  tlaId: string;
  tla: TLA;
  userId: string;
  signatureName: string;
  role: 'lessor' | 'lessee';
  insuranceOption?: InsuranceOption;
  locations?: TLA['locations'];
}

export interface TripActionParams {
  firestore: Firestore;
  tlaId: string;
  tla: TLA;
  userId: string;
  userName: string;
}

/**
 * Sign a TLA as lessor or lessee with complete audit trail
 */
export async function signTLA(params: SignTLAParams): Promise<TLA | null> {
  const { firestore, tlaId, tla, userId, signatureName, role, insuranceOption, locations } = params;
  
  try {
    // Capture audit trail data
    const auditData = await captureSignatureAudit();
    
    const signature = {
      signedBy: userId,
      signedByName: signatureName,
      signedByRole: role,
      signedAt: auditData.timestamp,
      // NEW: E-signature audit trail fields
      ipAddress: auditData.ipAddress,
      userAgent: auditData.userAgent,
      consentToEsign: true, // User explicitly checked the consent box
    };
    
    const updateData: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };
    
    // Determine the other party's signature status
    const otherPartyHasSigned = role === 'lessor' ? !!tla.lesseeSignature : !!tla.lessorSignature;
    
    if (role === 'lessor') {
      updateData.lessorSignature = signature;
      
      if (otherPartyHasSigned) {
        // Both have now signed
        updateData.status = 'signed';
        updateData.signedAt = new Date().toISOString();
        
        // Notify both parties
        await Promise.all([
          notify.tlaSigned({
            recipientEmail: tla.lessor.contactEmail,
            recipientName: tla.lessor.legalName,
            driverName: tla.driver.name,
            loadOrigin: tla.trip.origin,
            loadDestination: tla.trip.destination,
            rate: tla.payment.amount,
            tlaId: tlaId,
          }).catch(err => console.error('Failed to notify lessor:', err)),
          
          notify.tlaSigned({
            recipientEmail: tla.lessee.contactEmail,
            recipientName: tla.lessee.legalName,
            driverName: tla.driver.name,
            loadOrigin: tla.trip.origin,
            loadDestination: tla.trip.destination,
            rate: tla.payment.amount,
            tlaId: tlaId,
          }).catch(err => console.error('Failed to notify lessee:', err)),
        ]);
      } else {
        // Waiting for lessee to sign
        updateData.status = 'pending_lessee';
        
        notify.tlaReady({
          recipientEmail: tla.lessee.contactEmail,
          recipientName: tla.lessee.legalName,
          role: 'lessee',
          driverName: tla.driver.name,
          loadOrigin: tla.trip.origin,
          loadDestination: tla.trip.destination,
          rate: tla.payment.amount,
          tlaId: tlaId,
        }).catch(err => console.error('Failed to send TLA ready notification:', err));
      }
      
    } else if (role === 'lessee') {
      updateData.lesseeSignature = signature;

      if (insuranceOption) {
        updateData.insurance = {
          option: insuranceOption,
          confirmedAt: new Date().toISOString(),
          confirmedBy: userId,
        };
      }

      // Save location details if provided
      if (locations) {
        updateData.locations = locations;
      }
      
      if (otherPartyHasSigned) {
        // Both have now signed
        updateData.status = 'signed';
        updateData.signedAt = new Date().toISOString();
        
        // Notify both parties
        await Promise.all([
          notify.tlaSigned({
            recipientEmail: tla.lessor.contactEmail,
            recipientName: tla.lessor.legalName,
            driverName: tla.driver.name,
            loadOrigin: tla.trip.origin,
            loadDestination: tla.trip.destination,
            rate: tla.payment.amount,
            tlaId: tlaId,
          }).catch(err => console.error('Failed to notify lessor:', err)),
          
          notify.tlaSigned({
            recipientEmail: tla.lessee.contactEmail,
            recipientName: tla.lessee.legalName,
            driverName: tla.driver.name,
            loadOrigin: tla.trip.origin,
            loadDestination: tla.trip.destination,
            rate: tla.payment.amount,
            tlaId: tlaId,
          }).catch(err => console.error('Failed to notify lessee:', err)),
        ]);
      } else {
        // Waiting for lessor to sign
        updateData.status = 'pending_lessor';
        
        notify.tlaReady({
          recipientEmail: tla.lessor.contactEmail,
          recipientName: tla.lessor.legalName,
          role: 'lessor',
          driverName: tla.driver.name,
          loadOrigin: tla.trip.origin,
          loadDestination: tla.trip.destination,
          rate: tla.payment.amount,
          tlaId: tlaId,
        }).catch(err => console.error('Failed to send TLA ready notification:', err));
      }
    }
    
    await updateDoc(doc(firestore, `tlas/${tlaId}`), updateData);
    
    // Update match status if both signed
    if (updateData.status === 'signed' && tla.matchId) {
      try {
        await updateDoc(doc(firestore, `matches/${tla.matchId}`), {
          status: 'tla_signed',
        });
      } catch (matchErr) {
        console.warn("Could not update match status:", matchErr);
      }
    }
    
    showSuccess(
      otherPartyHasSigned 
        ? "TLA fully signed! Trip can now begin." 
        : `Signed! Waiting for ${role === 'lessor' ? 'lessee' : 'lessor'} to sign.`
    );
    
    // Fetch and return updated TLA
    const updatedDoc = await getDoc(doc(firestore, `tlas/${tlaId}`));
    if (updatedDoc.exists()) {
      return { id: updatedDoc.id, ...updatedDoc.data() } as TLA;
    }
    
    return null;
  } catch (error) {
    console.error("Error signing TLA:", error);
    showError("Failed to sign. Please try again.");
    throw error;
  }
}

/**
 * Start a trip
 */
export async function startTrip(params: TripActionParams): Promise<TLA | null> {
  const { firestore, tlaId, tla, userId, userName } = params;
  
  try {
    const now = new Date().toISOString();
    
    const updateData = {
      status: 'in_progress',
      tripTracking: {
        startedAt: now,
        startedBy: userId,
        startedByName: userName,
      },
      updatedAt: now,
    };
    
    await updateDoc(doc(firestore, `tlas/${tlaId}`), updateData);
    
    // Update match status
    if (tla.matchId) {
      await updateDoc(doc(firestore, `matches/${tla.matchId}`), {
        status: 'in_progress',
      }).catch(err => console.warn("Could not update match:", err));
    }
    
    // Update driver availability
    try {
      const driverRef = doc(firestore, `owner_operators/${tla.lessor.ownerOperatorId}/drivers/${tla.driver.id}`);
      await updateDoc(driverRef, { availability: 'On-trip' });
    } catch (err) {
      console.warn("Could not update driver availability:", err);
    }
    
    // Send notifications
    await Promise.all([
      notify.tripStarted({
        recipientEmail: tla.lessor.contactEmail,
        recipientName: tla.lessor.legalName,
        driverName: tla.driver.name,
        loadOrigin: tla.trip.origin,
        loadDestination: tla.trip.destination,
        rate: tla.payment.amount,
        tlaId: tlaId,
        startedByName: userName,
      }).catch(err => console.error('Failed to notify lessor:', err)),
      
      notify.tripStarted({
        recipientEmail: tla.lessee.contactEmail,
        recipientName: tla.lessee.legalName,
        driverName: tla.driver.name,
        loadOrigin: tla.trip.origin,
        loadDestination: tla.trip.destination,
        rate: tla.payment.amount,
        tlaId: tlaId,
        startedByName: userName,
      }).catch(err => console.error('Failed to notify lessee:', err)),
    ]);
    
    showSuccess("Trip started! Both parties have been notified.");
    
    // Fetch and return updated TLA
    const updatedDoc = await getDoc(doc(firestore, `tlas/${tlaId}`));
    if (updatedDoc.exists()) {
      return { id: updatedDoc.id, ...updatedDoc.data() } as TLA;
    }
    
    return null;
  } catch (error) {
    console.error("Error starting trip:", error);
    showError("Failed to start trip. Please try again.");
    throw error;
  }
}

/**
 * End a trip
 */
export async function endTrip(params: TripActionParams): Promise<TLA | null> {
  const { firestore, tlaId, tla, userId, userName } = params;
  
  if (!tla.tripTracking?.startedAt) {
    showError("Trip has not been started yet.");
    return null;
  }
  
  try {
    const now = new Date().toISOString();
    const durationMinutes = calculateTripDuration(tla.tripTracking.startedAt, now);
    
    const updateData = {
      status: 'completed',
      tripTracking: {
        ...tla.tripTracking,
        endedAt: now,
        endedBy: userId,
        endedByName: userName,
        durationMinutes: durationMinutes,
      },
      updatedAt: now,
    };
    
    await updateDoc(doc(firestore, `tlas/${tlaId}`), updateData);
    
    // Update match status
    if (tla.matchId) {
      await updateDoc(doc(firestore, `matches/${tla.matchId}`), {
        status: 'completed',
      }).catch(err => console.warn("Could not update match:", err));
    }
    
    // Update load status
    if (tla.matchId) {
      try {
        const matchDoc = await getDoc(doc(firestore, `matches/${tla.matchId}`));
        if (matchDoc.exists()) {
          const matchData = matchDoc.data();
          if (matchData.loadId && matchData.loadOwnerId) {
            await updateDoc(
              doc(firestore, `owner_operators/${matchData.loadOwnerId}/loads/${matchData.loadId}`),
              { status: 'Delivered' }
            );
          }
        }
      } catch (err) {
        console.warn("Could not update load status:", err);
      }
    }
    
    const tripDurationStr = formatTripDuration(durationMinutes);
    
    // Send notifications
    await Promise.all([
      notify.tripCompleted({
        recipientEmail: tla.lessor.contactEmail,
        recipientName: tla.lessor.legalName,
        driverName: tla.driver.name,
        loadOrigin: tla.trip.origin,
        loadDestination: tla.trip.destination,
        rate: tla.payment.amount,
        tlaId: tlaId,
        endedByName: userName,
        tripDuration: tripDurationStr,
      }).catch(err => console.error('Failed to notify lessor:', err)),
      
      notify.tripCompleted({
        recipientEmail: tla.lessee.contactEmail,
        recipientName: tla.lessee.legalName,
        driverName: tla.driver.name,
        loadOrigin: tla.trip.origin,
        loadDestination: tla.trip.destination,
        rate: tla.payment.amount,
        tlaId: tlaId,
        endedByName: userName,
        tripDuration: tripDurationStr,
      }).catch(err => console.error('Failed to notify lessee:', err)),
    ]);
    
    // Fetch and return updated TLA
    const updatedDoc = await getDoc(doc(firestore, `tlas/${tlaId}`));
    if (updatedDoc.exists()) {
      return { id: updatedDoc.id, ...updatedDoc.data() } as TLA;
    }
    
    return null;
  } catch (error) {
    console.error("Error ending trip:", error);
    showError("Failed to end trip. Please try again.");
    throw error;
  }
}

/**
 * Update driver availability after trip completion
 */
export async function updateDriverAvailability(
  firestore: Firestore,
  tla: TLA,
  markAvailable: boolean
): Promise<void> {
  try {
    const driverRef = doc(firestore, `owner_operators/${tla.lessor.ownerOperatorId}/drivers/${tla.driver.id}`);
    await updateDoc(driverRef, { 
      availability: markAvailable ? 'Available' : 'Off-duty' 
    });
    showSuccess(
      `Trip completed! Driver marked as ${markAvailable ? 'Available' : 'Off-duty'}.`
    );
  } catch (err) {
    console.warn("Could not update driver availability:", err);
    showSuccess("Trip completed!");
  }
}
