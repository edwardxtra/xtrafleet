/**
 * Admin: bulk suspend / reactivate / delete owner operators.
 *
 * The console used to run these as client-side writeBatches, which
 * firestore.rules only permits for a super_admin. Server-side now, with the
 * same per-action permissions the single-user routes enforce.
 *
 * POST body: { action: 'suspend' | 'reactivate' | 'delete', userIds: string[], reason?: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withCors } from '@/lib/api-cors';
import { requireAdminContext } from '@/lib/admin-auth';
import { hasPermission, type AdminPermission } from '@/lib/admin-roles';

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status });
}

// Cap per request: each delete costs two subcollection reads plus a batch, and
// the response has to stay inside the platform's request timeout.
const MAX_IDS = 100;

const bodySchema = z.object({
  action: z.enum(['suspend', 'reactivate', 'delete']),
  userIds: z.array(z.string().trim().min(1)).min(1, 'At least one user id is required'),
  reason: z.string().trim().optional(),
});

const PERMISSION_FOR: Record<'suspend' | 'reactivate' | 'delete', AdminPermission> = {
  suspend: 'users:suspend',
  reactivate: 'users:suspend',
  delete: 'users:delete',
};

async function handlePost(request: NextRequest) {
  try {
    const ctx = await requireAdminContext(request);
    if (!ctx.ok) return ctx.response;
    const { auth, db, adminUid, adminEmail, role } = ctx;

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return json({ error: 'Invalid request body.' }, 400);
    }
    const parsed = bodySchema.safeParse(rawBody);
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
    const { action, userIds, reason } = parsed.data;

    if (!hasPermission(role, PERMISSION_FOR[action])) {
      return json({ error: `You do not have permission to ${action} users.` }, 403);
    }
    if (userIds.length > MAX_IDS) {
      return json(
        { error: `Too many users in one request (max ${MAX_IDS}). Select fewer and try again.` },
        400
      );
    }

    const now = new Date().toISOString();
    const processed: string[] = [];
    const skipped: { id: string; reason: string }[] = [];

    for (const userId of userIds) {
      const ooRef = db.collection('owner_operators').doc(userId);
      const ooSnap = await ooRef.get();
      if (!ooSnap.exists) {
        skipped.push({ id: userId, reason: 'not found' });
        continue;
      }
      const target = ooSnap.data() as { isAdmin?: boolean };
      if (target.isAdmin) {
        skipped.push({ id: userId, reason: 'is an admin' });
        continue;
      }
      if (userId === adminUid) {
        skipped.push({ id: userId, reason: 'is you' });
        continue;
      }

      if (action === 'delete') {
        const [driversSnap, loadsSnap] = await Promise.all([
          ooRef.collection('drivers').get(),
          ooRef.collection('loads').get(),
        ]);
        // One batch per user, so a single user's subcollections go with their
        // doc and no batch approaches the 500-op limit.
        const batch = db.batch();
        driversSnap.docs.forEach(d => batch.delete(d.ref));
        loadsSnap.docs.forEach(d => batch.delete(d.ref));
        batch.delete(db.collection('users').doc(userId));
        batch.delete(ooRef);
        await batch.commit();

        try {
          await auth.deleteUser(userId);
        } catch (err: unknown) {
          const code =
            (err as { code?: string })?.code ||
            (err as { errorInfo?: { code?: string } })?.errorInfo?.code ||
            '';
          if (code !== 'auth/user-not-found') throw err;
        }
      } else if (action === 'suspend') {
        await ooRef.update({
          isSuspended: true,
          suspendedReason: reason || '',
          suspendedAt: now,
          suspendedBy: adminUid,
        });
      } else {
        await ooRef.update({
          isSuspended: false,
          suspendedReason: null,
          suspendedAt: null,
          suspendedBy: null,
          reactivatedAt: now,
          reactivatedBy: adminUid,
        });
      }

      processed.push(userId);
    }

    await db.collection('admin_audit').add({
      action:
        action === 'delete'
          ? 'user_deleted'
          : action === 'suspend'
            ? 'user_suspended'
            : 'user_reactivated',
      adminId: adminUid,
      adminEmail,
      targetType: 'owner_operator',
      targetId: 'bulk',
      details: {
        count: processed.length,
        userIds: processed,
        skipped,
        reason: reason || '',
      },
      timestamp: now,
    });

    return json({ success: true, processed: processed.length, skipped }, 200);
  } catch (error) {
    console.error('[POST /api/admin/users/bulk]', error);
    return json({ error: 'An unexpected error occurred.' }, 500);
  }
}

export const POST = withCors(handlePost);
