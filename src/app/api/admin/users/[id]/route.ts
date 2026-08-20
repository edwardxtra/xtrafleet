/**
 * Admin: update or delete an owner operator (DEV follow-up to the
 * server-side create route).
 *
 * These used to be client-side writes from /admin/users. `firestore.rules`
 * allows `update`/`delete` on owner_operators only for the doc's own owner or
 * a super_admin, so a plain `admin` — however much the console's own
 * permission matrix said they could — always got "Missing or insufficient
 * permissions". Both actions now run through the Admin SDK, which bypasses
 * rules, with the console's role permissions enforced here instead.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withCors } from '@/lib/api-cors';
import { requireAdminContext } from '@/lib/admin-auth';
import { hasPermission } from '@/lib/admin-roles';

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status });
}

const patchSchema = z.object({
  companyName: z.string().trim().optional(),
  legalName: z.string().trim().optional(),
  contactName: z.string().trim().optional(),
  contactEmail: z.string().trim().email().optional().or(z.literal('')),
  phone: z.string().trim().optional(),
  dotNumber: z.string().trim().optional(),
  mcNumber: z.string().trim().optional(),
  ein: z.string().trim().optional(),
  dba: z.string().trim().optional(),
  address: z.string().trim().optional(),
  hqAddress: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  zipCode: z.string().trim().optional(),
  loadLocation: z.string().trim().optional(),
  serviceRegions: z.string().trim().optional(),
  coiDocumentUrl: z.string().trim().optional(),
  coiDocumentUploadedAt: z.string().trim().optional(),
  accountStatus: z.enum(['', 'pre-activated', 'active', 'suspended']).optional(),
  subscriptionStatus: z.string().trim().optional(),
  subscriptionPlan: z.string().trim().optional(),
});

async function handlePatch(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const ctx = await requireAdminContext(request);
    if (!ctx.ok) return ctx.response;
    const { db, adminUid, adminEmail, role } = ctx;

    if (!hasPermission(role, 'users:edit')) {
      return json({ error: 'You do not have permission to edit users.' }, 403);
    }

    const userId = context.params.id;
    if (!userId) return json({ error: 'A user id is required.' }, 400);

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return json({ error: 'Invalid request body.' }, 400);
    }
    const parsed = patchSchema.safeParse(rawBody);
    if (!parsed.success) {
      return json(
        {
          error:
            Object.values(parsed.error.flatten().fieldErrors).flat().join(', ') ||
            'Invalid input.',
        },
        400
      );
    }
    const { coiDocumentUrl, coiDocumentUploadedAt, accountStatus, ...rest } = parsed.data;

    const ooRef = db.collection('owner_operators').doc(userId);
    const ooSnap = await ooRef.get();
    if (!ooSnap.exists) return json({ error: 'User not found.' }, 404);

    const payload: Record<string, unknown> = {
      ...rest,
      updatedAt: new Date().toISOString(),
      updatedBy: adminUid,
    };
    // Nested insurance fields via dot-notation so other insurance.* fields
    // written by other flows aren't clobbered.
    if (coiDocumentUrl) payload['insurance.coiDocumentUrl'] = coiDocumentUrl;
    if (coiDocumentUploadedAt) payload['insurance.coiDocumentUploadedAt'] = coiDocumentUploadedAt;
    // accountStatus is optional in the form — only flip when a value was picked.
    if (accountStatus) payload.accountStatus = accountStatus;

    await ooRef.update(payload);

    await db.collection('admin_audit').add({
      action: 'user_updated',
      adminId: adminUid,
      adminEmail,
      targetType: 'owner_operator',
      targetId: userId,
      details: { fields: Object.keys(payload) },
      timestamp: new Date().toISOString(),
    });

    return json({ success: true }, 200);
  } catch (error) {
    console.error('[PATCH /api/admin/users/[id]]', error);
    return json({ error: 'An unexpected error occurred while updating the user.' }, 500);
  }
}

async function handleDelete(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const ctx = await requireAdminContext(request);
    if (!ctx.ok) return ctx.response;
    const { auth, db, adminUid, adminEmail, role } = ctx;

    if (!hasPermission(role, 'users:delete')) {
      return json({ error: 'You do not have permission to delete users.' }, 403);
    }

    const userId = context.params.id;
    if (!userId) return json({ error: 'A user id is required.' }, 400);
    if (userId === adminUid) {
      return json({ error: 'You cannot delete your own account.' }, 400);
    }

    const ooRef = db.collection('owner_operators').doc(userId);
    const ooSnap = await ooRef.get();
    if (!ooSnap.exists) return json({ error: 'User not found.' }, 404);

    const target = ooSnap.data() as { isAdmin?: boolean; companyName?: string };
    if (target.isAdmin) {
      return json({ error: 'Cannot delete admin users.' }, 400);
    }

    // Subcollections first, then the doc itself — same order the console used.
    const [driversSnap, loadsSnap] = await Promise.all([
      ooRef.collection('drivers').get(),
      ooRef.collection('loads').get(),
    ]);

    const batch = db.batch();
    driversSnap.docs.forEach(d => batch.delete(d.ref));
    loadsSnap.docs.forEach(d => batch.delete(d.ref));
    batch.delete(db.collection('users').doc(userId));
    batch.delete(ooRef);
    await batch.commit();

    // The Firebase Auth account outlives the Firestore docs unless we remove
    // it here. Leaving it behind would block re-creating the same email —
    // POST /api/admin/users rejects addresses that still have an Auth user.
    let authDeleted = false;
    try {
      await auth.deleteUser(userId);
      authDeleted = true;
    } catch (err: unknown) {
      const code =
        (err as { code?: string })?.code ||
        (err as { errorInfo?: { code?: string } })?.errorInfo?.code ||
        '';
      // Pre-activated accounts have no Auth user yet — nothing to clean up.
      if (code !== 'auth/user-not-found') throw err;
    }

    await db.collection('admin_audit').add({
      action: 'user_deleted',
      adminId: adminUid,
      adminEmail,
      targetType: 'owner_operator',
      targetId: userId,
      details: {
        companyName: target.companyName || '',
        driversDeleted: driversSnap.size,
        loadsDeleted: loadsSnap.size,
        authDeleted,
      },
      timestamp: new Date().toISOString(),
    });

    return json(
      { success: true, driversDeleted: driversSnap.size, loadsDeleted: loadsSnap.size },
      200
    );
  } catch (error) {
    console.error('[DELETE /api/admin/users/[id]]', error);
    return json({ error: 'An unexpected error occurred while deleting the user.' }, 500);
  }
}

// withCors loses the dynamic-route params; pull the id off the URL path.
// This route is /api/admin/users/[id], so the id is the last segment.
function idFromPath(req: NextRequest) {
  const parts = req.nextUrl.pathname.split('/');
  return parts[parts.length - 1];
}

export const PATCH = withCors(async (req: NextRequest) =>
  handlePatch(req, { params: { id: idFromPath(req) } })
);

export const DELETE = withCors(async (req: NextRequest) =>
  handleDelete(req, { params: { id: idFromPath(req) } })
);
