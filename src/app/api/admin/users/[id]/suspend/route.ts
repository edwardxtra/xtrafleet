/**
 * Admin: suspend or reactivate an owner operator.
 *
 * Previously a client-side updateDoc from /admin/users, which firestore.rules
 * only permits for the doc's own owner or a super_admin — so a plain `admin`
 * with the users:suspend permission was blocked. Now server-side via the
 * Admin SDK, gated on that permission here.
 *
 * POST body: { suspend: boolean, reason?: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withCors } from '@/lib/api-cors';
import { requireAdminContext } from '@/lib/admin-auth';
import { hasPermission } from '@/lib/admin-roles';

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status });
}

const bodySchema = z.object({
  suspend: z.boolean(),
  reason: z.string().trim().optional(),
});

async function handlePost(request: NextRequest, userId: string) {
  try {
    const ctx = await requireAdminContext(request);
    if (!ctx.ok) return ctx.response;
    const { db, adminUid, adminEmail, role } = ctx;

    if (!hasPermission(role, 'users:suspend')) {
      return json({ error: 'You do not have permission to suspend users.' }, 403);
    }
    if (!userId) return json({ error: 'A user id is required.' }, 400);

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return json({ error: 'Invalid request body.' }, 400);
    }
    const parsed = bodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return json({ error: 'A `suspend` boolean is required.' }, 400);
    }
    const { suspend, reason } = parsed.data;

    const ooRef = db.collection('owner_operators').doc(userId);
    const ooSnap = await ooRef.get();
    if (!ooSnap.exists) return json({ error: 'User not found.' }, 404);

    const target = ooSnap.data() as { isAdmin?: boolean };
    if (target.isAdmin && suspend) {
      return json({ error: 'Cannot suspend admin users.' }, 400);
    }

    const now = new Date().toISOString();
    await ooRef.update(
      suspend
        ? {
            isSuspended: true,
            suspendedReason: reason || '',
            suspendedAt: now,
            suspendedBy: adminUid,
          }
        : {
            isSuspended: false,
            suspendedReason: null,
            suspendedAt: null,
            suspendedBy: null,
            reactivatedAt: now,
            reactivatedBy: adminUid,
          }
    );

    await db.collection('admin_audit').add({
      action: suspend ? 'user_suspended' : 'user_reactivated',
      adminId: adminUid,
      adminEmail,
      targetType: 'owner_operator',
      targetId: userId,
      details: { reason: reason || '' },
      timestamp: now,
    });

    return json({ success: true }, 200);
  } catch (error) {
    console.error('[POST /api/admin/users/[id]/suspend]', error);
    return json({ error: 'An unexpected error occurred.' }, 500);
  }
}

export const POST = withCors(async (req: NextRequest) => {
  // withCors loses the dynamic-route params; pull them off the URL path.
  // /api/admin/users/[id]/suspend
  const parts = req.nextUrl.pathname.split('/');
  return handlePost(req, parts[parts.length - 2]);
});
