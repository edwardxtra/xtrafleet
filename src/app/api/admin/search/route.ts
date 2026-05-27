/**
 * Admin global search across owner_operators, drivers, loads, matches, tlas.
 *
 * Firestore doesn't support contains/regex queries natively, so this is an
 * O(n) substring scan capped to the most recent ~500 docs per collection.
 * Returns up to 10 results per type. Plenty for an admin tool today; can be
 * upgraded to a real search index later if data scale demands it.
 *
 * Permission: `audit:view`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase-admin-singleton';
import { withCors } from '@/lib/api-cors';
import { hasPermission, getDefaultRoleForLegacyAdmin, type AdminRole } from '@/lib/admin-roles';

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status });
}

const SCAN_LIMIT = 500;
const PER_TYPE_RESULTS = 10;

type SearchResult = {
  id: string;
  label: string;
  sub?: string;
  detail?: string;
};

async function handleGet(request: NextRequest) {
  try {
    const { auth, db } = await getFirebaseAdmin();

    const tokenCookie = request.cookies.get('fb-id-token');
    if (!tokenCookie) return json({ error: 'You must be signed in.' }, 401);
    let decoded: { uid: string; email?: string };
    try {
      try {
        decoded = await auth.verifySessionCookie(tokenCookie.value, true);
      } catch {
        decoded = await auth.verifyIdToken(tokenCookie.value);
      }
    } catch {
      return json({ error: 'Your session is invalid. Please sign in again.' }, 401);
    }

    const adminSnap = await db.collection('owner_operators').doc(decoded.uid).get();
    const adminData = adminSnap.exists ? adminSnap.data() : null;
    if (!adminData?.isAdmin) return json({ error: 'Admin access required.' }, 403);
    const role: AdminRole = (adminData.adminRole as AdminRole) || getDefaultRoleForLegacyAdmin();
    if (!hasPermission(role, 'audit:view')) {
      return json({ error: 'You do not have permission to search.' }, 403);
    }

    const q = (request.nextUrl.searchParams.get('q') || '').trim().toLowerCase();
    if (!q) {
      return json(
        { owner_operators: [], drivers: [], loads: [], matches: [], tlas: [] },
        200
      );
    }

    const has = (v: unknown) => typeof v === 'string' && v.toLowerCase().includes(q);

    const [ooSnap, driversSnap, loadsSnap, matchesSnap, tlasSnap] = await Promise.all([
      db.collection('owner_operators').limit(SCAN_LIMIT).get(),
      db.collectionGroup('drivers').limit(SCAN_LIMIT).get(),
      db.collectionGroup('loads').limit(SCAN_LIMIT).get(),
      db.collection('matches').orderBy('createdAt', 'desc').limit(SCAN_LIMIT).get(),
      db.collection('tlas').orderBy('createdAt', 'desc').limit(SCAN_LIMIT).get(),
    ]);

    const owner_operators: SearchResult[] = [];
    for (const d of ooSnap.docs) {
      const v = d.data() as Record<string, any>;
      if (
        has(d.id) || has(v.companyName) || has(v.legalName) || has(v.contactEmail) ||
        has(v.dotNumber) || has(v.mcNumber) || has(v.contactName)
      ) {
        owner_operators.push({
          id: d.id,
          label: v.companyName || v.legalName || v.contactEmail || d.id,
          sub: v.contactEmail || '',
          detail: [v.dotNumber && `DOT ${v.dotNumber}`, v.mcNumber].filter(Boolean).join(' · '),
        });
        if (owner_operators.length >= PER_TYPE_RESULTS) break;
      }
    }

    const drivers: SearchResult[] = [];
    for (const d of driversSnap.docs) {
      const v = d.data() as Record<string, any>;
      if (has(d.id) || has(v.name) || has(v.email) || has(v.location) || has(v.cdlLicense)) {
        const ownerId = d.ref.path.split('/')[1];
        drivers.push({
          id: d.id,
          label: v.name || v.email || d.id,
          sub: v.email || '',
          detail: [v.location, v.cdlLicense, `owner ${ownerId}`].filter(Boolean).join(' · '),
        });
        if (drivers.length >= PER_TYPE_RESULTS) break;
      }
    }

    const loads: SearchResult[] = [];
    for (const d of loadsSnap.docs) {
      const v = d.data() as Record<string, any>;
      if (has(d.id) || has(v.origin) || has(v.destination) || has(v.cargo) || has(v.description)) {
        loads.push({
          id: d.id,
          label: `${v.origin || '?'} → ${v.destination || '?'}`,
          sub: v.cargo || '',
          detail: v.status || '',
        });
        if (loads.length >= PER_TYPE_RESULTS) break;
      }
    }

    const matches: SearchResult[] = [];
    for (const d of matchesSnap.docs) {
      const v = d.data() as Record<string, any>;
      if (
        has(d.id) ||
        has(v.loadOwnerName) || has(v.driverOwnerName) || has(v.driverName) ||
        has(v.loadSnapshot?.origin) || has(v.loadSnapshot?.destination) ||
        has(v.loadOwnerId) || has(v.driverOwnerId)
      ) {
        matches.push({
          id: d.id,
          label: `${v.loadSnapshot?.origin || '?'} → ${v.loadSnapshot?.destination || '?'}`,
          sub: `${v.loadOwnerName || ''} ↔ ${v.driverOwnerName || ''}`,
          detail: v.status || '',
        });
        if (matches.length >= PER_TYPE_RESULTS) break;
      }
    }

    const tlas: SearchResult[] = [];
    for (const d of tlasSnap.docs) {
      const v = d.data() as Record<string, any>;
      if (
        has(d.id) ||
        has(v.trip?.origin) || has(v.trip?.destination) ||
        has(v.lessor?.legalName) || has(v.lessee?.legalName) ||
        has(v.driver?.name) || has(v.matchId)
      ) {
        tlas.push({
          id: d.id,
          label: `${v.trip?.origin || '?'} → ${v.trip?.destination || '?'}`,
          sub: `${v.lessor?.legalName || ''} ↔ ${v.lessee?.legalName || ''}`,
          detail: v.status || '',
        });
        if (tlas.length >= PER_TYPE_RESULTS) break;
      }
    }

    return json({ owner_operators, drivers, loads, matches, tlas }, 200);
  } catch (error: any) {
    console.error('[GET /api/admin/search]', error);
    return json({ error: 'Search failed.' }, 500);
  }
}

export const GET = withCors(handleGet);
