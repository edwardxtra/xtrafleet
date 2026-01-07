
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, initializeFirebaseAdmin } from '@/lib/firebase/server-auth';
import { handleError } from '@/lib/api-utils';

// POST is now handled by /api/add-new-driver
// We keep GET here for fetching the list of drivers.

export async function GET(req: NextRequest) {
    const adminApp = initializeFirebaseAdmin();
    if (!adminApp) {
        return handleError(new Error('Server misconfigured'), 'Server configuration error. Cannot connect to backend services.', 500);
    }

    try {
        const user = await getAuthenticatedUser();
        if (!user) {
            return handleError(new Error('Unauthorized'), 'Unauthorized', 401);
        }

        const firestore = adminApp.firestore();
        const driversCollection = firestore.collection(`owner_operators/${user.uid}/drivers`);
        // We only want to display active drivers in the main list
        const querySnapshot = await driversCollection.where('status', '==', 'active').get();
        const drivers = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        return NextResponse.json(drivers, { status: 200 });

    } catch (error: any) {
        return handleError(error, 'Failed to fetch drivers');
    }
}
