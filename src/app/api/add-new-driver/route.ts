
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser, initializeFirebaseAdmin } from '@/lib/firebase/server-auth';
import admin from 'firebase-admin';
import { handleError } from '@/lib/api-utils';

// This is a placeholder for a real email sending service.
async function sendInvitationEmail(email: string, ownerOperatorName: string, inviteLink: string) {
  console.log("--- SIMULATING DRIVER INVITATION EMAIL ---");
  console.log(`To: ${email}`);
  console.log(`From: noreply@fleetconnect.app`);
  console.log(`Subject: You're invited to join ${ownerOperatorName} on FleetConnect`);
  console.log(`Body:`);
  console.log(`Hello,`);
  console.log(`You have been invited to join ${ownerOperatorName}'s fleet on FleetConnect.`);
  console.log(`Please click the link below to create your account and set up your driver profile:`);
  console.log(inviteLink);
  console.log(`--- END OF SIMULATION ---`);
  return Promise.resolve();
}

const inviteSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export async function POST(req: NextRequest) {
  const adminApp = initializeFirebaseAdmin();
  if (!adminApp) {
    return handleError(new Error('Server misconfigured'), 'Server configuration error. Cannot connect to backend services.', 500);
  }

  try {
    const auth = adminApp.auth();
    const firestore = adminApp.firestore();
    
    const ownerUser = await getAuthenticatedUser();
    
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

    // Check if a user with this email already exists
    try {
        const existingUser = await auth.getUserByEmail(email);
        if(existingUser) {
            // Check if they are already part of another fleet or this one
            const driverQuery = await firestore.collectionGroup('drivers').where('email', '==', email).limit(1).get();
            if(!driverQuery.empty) {
                 return handleError(new Error('Driver exists'), `A driver with the email ${email} is already associated with a fleet.`, 409);
            }
        }
    } catch (error: any) {
        if (error.code !== 'auth/user-not-found') {
            throw error; // Re-throw unexpected errors
        }
        // This is the expected case for a new invitation: the user does not exist.
    }

    const newDriverData = { 
        email: email,
        ownerOperatorId: ownerOperatorId, 
        status: 'invited',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    const docRef = await firestore.collection(`owner_operators/${ownerOperatorId}/drivers`).add(newDriverData);

    // The continueUrl now points to our new driver registration page
    const inviteLink = await auth.generatePasswordResetLink(email, {
        url: `${req.nextUrl.origin}/driver-register?driverId=${docRef.id}&ownerId=${ownerOperatorId}`
    });

    const ownerDoc = await firestore.doc(`owner_operators/${ownerOperatorId}`).get();
    const ownerOperatorName = ownerDoc.data()?.companyName || 'your organization';
    
    await sendInvitationEmail(email, ownerOperatorName, inviteLink);
    
    return NextResponse.json({ id: docRef.id, message: 'Invitation sent successfully.' }, { status: 201 });

  } catch (error: any) {
    return handleError(error, 'Failed to send invitation');
  }
}
