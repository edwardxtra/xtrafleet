/**
 * POST /api/matches/accept — server-side match formation (DEV-162).
 *
 * This is the single path through which a match is accepted and a TLA formed.
 * The synchronous bilateral compliance gate fires here, in-request, before any
 * record is written. Firestore rules forbid client-side TLA creation, so the
 * gate cannot be bypassed.
 *
 * Patent-relevant: the compliance check must remain synchronous with formation,
 * bilateral (both loadOwnerId and driverOwnerId), and snapshotted onto the TLA.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin, FieldValue } from '@/lib/firebase-admin-singleton';
import { withCors } from '@/lib/api-cors';
import { authenticateRequest } from '@/lib/api-auth';
import { rateLimiters, getIdentifier, formatTimeRemaining } from '@/lib/rate-limit';
import { runComplianceGate } from '@/lib/compliance-gate';
import { generateTLA } from '@/lib/tla';
import type { Match, OwnerOperator, Driver } from '@/lib/data';

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status });
}

async function handlePost(request: NextRequest) {
  // 1. Authenticate.
  let user;
  try {
    user = await authenticateRequest(request);
  } catch {
    return json({ error: 'You must be signed in to accept a match.' }, 401);
  }

  // 2. Rate limit per user.
  const { success, reset } = await rateLimiters.matchFormation.limit(
    getIdentifier(request, user.uid)
  );
  if (!success) {
    return json(
      { error: `Too many match attempts. Please try again in ${formatTimeRemaining(reset)}.` },
      429
    );
  }

  try {
    // 3. Validate input.
    let matchId: unknown;
    try {
      matchId = (await request.json())?.matchId;
    } catch {
      return json({ error: 'Invalid request body.' }, 400);
    }
    if (!matchId || typeof matchId !== 'string') {
      return json({ error: 'A matchId is required.' }, 400);
    }

    const { db } = await getFirebaseAdmin();

    // 4. Load the match.
    const matchSnap = await db.collection('matches').doc(matchId).get();
    if (!matchSnap.exists) {
      return json({ error: 'Match not found.' }, 404);
    }
    const match = { id: matchId, ...(matchSnap.data() as Omit<Match, 'id'>) } as Match;

    // 5. Authorize — the caller must be a party to the match.
    if (user.uid !== match.loadOwnerId && user.uid !== match.driverOwnerId) {
      return json({ error: 'You are not a participant in this match.' }, 403);
    }

    // 6. The match must still be open.
    if (match.status !== 'pending' && match.status !== 'countered') {
      return json(
        { error: `This match can no longer be accepted (status: ${match.status}).` },
        409
      );
    }

    // 7. Load both carriers, the driver, and the load.
    const [loadOwnerSnap, driverOwnerSnap, driverSnap, loadSnap] = await Promise.all([
      db.collection('owner_operators').doc(match.loadOwnerId).get(),
      db.collection('owner_operators').doc(match.driverOwnerId).get(),
      db
        .collection('owner_operators')
        .doc(match.driverOwnerId)
        .collection('drivers')
        .doc(match.driverId)
        .get(),
      db
        .collection('owner_operators')
        .doc(match.loadOwnerId)
        .collection('loads')
        .doc(match.loadId)
        .get(),
    ]);

    if (!loadOwnerSnap.exists) return json({ error: 'Load owner record not found.' }, 404);
    if (!driverOwnerSnap.exists) return json({ error: 'Driver owner record not found.' }, 404);
    if (!driverSnap.exists) return json({ error: 'Driver record not found.' }, 404);
    if (!loadSnap.exists) return json({ error: 'Load not found.' }, 404);

    const loadOwner = { id: loadOwnerSnap.id, ...(loadOwnerSnap.data() as object) } as OwnerOperator;
    const driverOwner = {
      id: driverOwnerSnap.id,
      ...(driverOwnerSnap.data() as object),
    } as OwnerOperator;
    const driver = { id: driverSnap.id, ...(driverSnap.data() as object) } as Driver;
    const loadData = loadSnap.data() as { status?: string };

    // 8. The load must still be available.
    if (loadData.status !== 'Pending') {
      return json(
        {
          error: `This load has already been matched (status: ${loadData.status}). Please refresh.`,
        },
        409
      );
    }

    // 9. SYNCHRONOUS COMPLIANCE GATE — blocking, bilateral, no cache.
    const gate = await runComplianceGate({ loadOwner, driverOwner, driver });

    const auditBase = {
      userId: user.uid,
      matchId,
      loadId: match.loadId,
      loadOwnerId: match.loadOwnerId,
      driverOwnerId: match.driverOwnerId,
      driverId: match.driverId,
      complianceDecision: gate.decision,
      complianceStatus: gate.snapshot.overallStatus,
      timestamp: FieldValue.serverTimestamp(),
    };

    if (gate.decision === 'block') {
      await db.collection('audit_logs').add({
        ...auditBase,
        action: 'match_formation_blocked',
        reason: gate.reason ?? 'Compliance gate blocked the match.',
      });
      // 403 = inactive authority; 422 = could not be verified.
      const status = gate.blockKind === 'authority' ? 403 : 422;
      return json({ error: gate.reason, complianceBlocked: true }, status);
    }

    // 10. Form the match — create the TLA carrying the compliance snapshot.
    const tla = {
      ...generateTLA({
        match,
        lessorInfo: driverOwner,
        lesseeInfo: loadOwner,
        driverInfo: driver,
      }),
      // JSON round-trip strips undefined values the Admin SDK would reject.
      complianceSnapshot: JSON.parse(JSON.stringify(gate.snapshot)),
    };
    const tlaRef = await db.collection('tlas').add(tla);

    const complianceWarning = gate.decision === 'warn';
    const isCounter = match.status === 'countered' && !!match.counterTerms;
    const now = new Date().toISOString();

    // Update the match.
    const matchUpdate: Record<string, unknown> = {
      status: 'tla_pending',
      tlaId: tlaRef.id,
      complianceWarning,
    };
    if (isCounter) {
      matchUpdate.counterAcceptedAt = now;
      matchUpdate.finalTerms = match.counterTerms;
    } else {
      matchUpdate.respondedAt = now;
    }
    await db.collection('matches').doc(matchId).update(matchUpdate);

    // Mark the load as Matched.
    await db
      .collection('owner_operators')
      .doc(match.loadOwnerId)
      .collection('loads')
      .doc(match.loadId)
      .update({ status: 'Matched', matchedAt: now, tlaId: tlaRef.id });

    await db.collection('audit_logs').add({ ...auditBase, action: 'match_formed', tlaId: tlaRef.id });

    // 11. Build the follow-up payload for non-critical client-side steps
    //     (conversation, email, in-app notification).
    const initiatedByLoadOwner = match.initiatedBy === 'load_owner' || !match.initiatedBy;
    const loadOwnerName = loadOwner.legalName || loadOwner.companyName || 'Load Owner';
    const loadOwnerCompany = loadOwner.companyName || loadOwnerName;
    const driverOwnerName = driverOwner.legalName || driverOwner.companyName || 'Driver Owner';
    const driverOwnerCompany = driverOwner.companyName || driverOwnerName;
    const rate = match.counterTerms?.rate ?? match.originalTerms.rate;

    let notification: Record<string, unknown>;
    let emailTo: string;
    let emailName: string;
    if (isCounter) {
      notification = {
        userId: match.driverOwnerId,
        type: 'counter_accepted',
        title: 'Counter Offer Accepted!',
        message: `Your counter offer for ${match.loadSnapshot.origin} → ${match.loadSnapshot.destination} was accepted!`,
        link: '/dashboard/messages',
        linkText: 'Go to Messages',
      };
      emailTo = driverOwner.contactEmail || '';
      emailName = driverOwnerName;
    } else {
      const recipientId = initiatedByLoadOwner ? match.loadOwnerId : match.driverOwnerId;
      const responderCompany = initiatedByLoadOwner ? driverOwnerCompany : loadOwnerCompany;
      notification = {
        userId: recipientId,
        type: 'match_accepted',
        title: 'Match Accepted!',
        message: `${responderCompany} accepted your match for ${match.loadSnapshot.origin} → ${match.loadSnapshot.destination}. You can now message them!`,
        link: '/dashboard/messages',
        linkText: 'Go to Messages',
      };
      emailTo = initiatedByLoadOwner ? loadOwner.contactEmail || '' : driverOwner.contactEmail || '';
      emailName = initiatedByLoadOwner ? loadOwnerName : driverOwnerName;
    }

    return json(
      {
        success: true,
        tlaId: tlaRef.id,
        complianceWarning,
        complianceMessage: complianceWarning
          ? `Match formed with a compliance warning. ${gate.warnings.join(' ')}`
          : undefined,
        followUp: {
          conversation: {
            driverOwnerId: match.driverOwnerId,
            loadOwnerId: match.loadOwnerId,
            loadId: match.loadId,
          },
          email: {
            to: emailTo,
            loadOwnerName: emailName,
            driverName: match.driverSnapshot?.name ?? match.driverName ?? 'Driver',
            loadOrigin: match.loadSnapshot.origin,
            loadDestination: match.loadSnapshot.destination,
            rate,
          },
          notification,
        },
      },
      200
    );
  } catch (error) {
    console.error('[POST /api/matches/accept]', error);
    return json({ error: 'An unexpected error occurred while forming the match.' }, 500);
  }
}

export const POST = withCors(handlePost);
