import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase-admin-singleton';
import { handleApiError, handleApiSuccess } from '@/lib/api-error-handler';
import { withCors } from '@/lib/api-cors';

/**
 * Verify token - handles both ID tokens and session cookies
 */
async function verifyToken(auth: any, tokenValue: string) {
  try {
    return await auth.verifySessionCookie(tokenValue, true);
  } catch {
    try {
      return await auth.verifyIdToken(tokenValue);
    } catch {
      throw new Error('Invalid authentication token');
    }
  }
}

/**
 * Delete all documents in a subcollection across all owner_operators
 */
async function deleteAllInSubcollection(db: FirebaseFirestore.Firestore, subcollection: string): Promise<number> {
  const ownerOperatorsSnap = await db.collection('owner_operators').get();
  let deletedCount = 0;

  for (const ownerDoc of ownerOperatorsSnap.docs) {
    const subcollectionRef = db.collection(`owner_operators/${ownerDoc.id}/${subcollection}`);
    const docsSnap = await subcollectionRef.get();

    // Delete in batches of 500 (Firestore limit)
    const batch = db.batch();
    let batchCount = 0;

    for (const doc of docsSnap.docs) {
      batch.delete(doc.ref);
      batchCount++;
      deletedCount++;

      if (batchCount === 500) {
        await batch.commit();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }
  }

  return deletedCount;
}

/**
 * Delete all documents in a top-level collection
 */
async function deleteAllInCollection(db: FirebaseFirestore.Firestore, collectionName: string): Promise<number> {
  const collectionRef = db.collection(collectionName);
  const docsSnap = await collectionRef.get();
  let deletedCount = 0;

  // Delete in batches of 500 (Firestore limit)
  let batch = db.batch();
  let batchCount = 0;

  for (const doc of docsSnap.docs) {
    batch.delete(doc.ref);
    batchCount++;
    deletedCount++;

    if (batchCount === 500) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  return deletedCount;
}

async function handlePost(req: NextRequest) {
  try {
    console.log('[Admin Clear Data] POST request received');

    const { auth, db } = await getFirebaseAdmin();

    // Get token from cookie
    const token = req.cookies.get('fb-id-token');
    if (!token) {
      throw new Error('Unauthorized');
    }

    // Verify token
    const decodedToken = await verifyToken(auth, token.value);
    console.log('[Admin Clear Data] User authenticated:', decodedToken.uid);

    // Check if user is super_admin
    const userDoc = await db.collection('owner_operators').doc(decodedToken.uid).get();
    if (!userDoc.exists) {
      throw new Error('User not found');
    }

    const userData = userDoc.data();
    if (!userData?.isAdmin || userData?.adminRole !== 'super_admin') {
      console.log('[Admin Clear Data] Access denied - not super_admin:', userData?.adminRole);
      return NextResponse.json(
        { error: 'Access denied. Super Admin role required.' },
        { status: 403 }
      );
    }

    // Parse request body to determine what to clear
    const body = await req.json();
    const { clearLoads, clearDrivers, clearMatches, clearTLAs } = body;

    if (!clearLoads && !clearDrivers && !clearMatches && !clearTLAs) {
      return NextResponse.json(
        { error: 'No data type specified to clear' },
        { status: 400 }
      );
    }

    const results: { loadsDeleted?: number; driversDeleted?: number; matchesDeleted?: number; tlasDeleted?: number } = {};

    // Clear loads if requested
    if (clearLoads) {
      console.log('[Admin Clear Data] Clearing all loads...');
      results.loadsDeleted = await deleteAllInSubcollection(db, 'loads');
      console.log(`[Admin Clear Data] Deleted ${results.loadsDeleted} loads`);
    }

    // Clear drivers if requested
    if (clearDrivers) {
      console.log('[Admin Clear Data] Clearing all drivers...');
      results.driversDeleted = await deleteAllInSubcollection(db, 'drivers');
      console.log(`[Admin Clear Data] Deleted ${results.driversDeleted} drivers`);
    }

    // Clear matches if requested
    if (clearMatches) {
      console.log('[Admin Clear Data] Clearing all matches...');
      results.matchesDeleted = await deleteAllInCollection(db, 'matches');
      console.log(`[Admin Clear Data] Deleted ${results.matchesDeleted} matches`);
    }

    // Clear TLAs if requested
    if (clearTLAs) {
      console.log('[Admin Clear Data] Clearing all TLAs...');
      results.tlasDeleted = await deleteAllInCollection(db, 'tlas');
      console.log(`[Admin Clear Data] Deleted ${results.tlasDeleted} TLAs`);
    }

    // Log audit action
    await db.collection('admin_audit').add({
      action: 'data_cleared',
      adminId: decodedToken.uid,
      adminEmail: decodedToken.email || '',
      targetType: 'system',
      details: {
        loadsDeleted: results.loadsDeleted || 0,
        driversDeleted: results.driversDeleted || 0,
        matchesDeleted: results.matchesDeleted || 0,
        tlasDeleted: results.tlasDeleted || 0,
      },
      timestamp: new Date().toISOString(),
    });

    return handleApiSuccess({
      message: 'Data cleared successfully',
      ...results,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage === 'Unauthorized' || errorMessage === 'Invalid authentication token') {
      return handleApiError('unauthorized', error instanceof Error ? error : new Error(errorMessage), {
        endpoint: 'POST /api/admin/clear-data',
        userId: 'unknown'
      });
    }

    return handleApiError('server', error instanceof Error ? error : new Error(errorMessage), {
      endpoint: 'POST /api/admin/clear-data'
    });
  }
}

export const POST = withCors(handlePost);
