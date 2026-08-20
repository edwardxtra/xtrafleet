/**
 * Admin: report which owner_operators actually have Firebase Auth accounts.
 *
 * The users list is built client-side from Firestore, which knows nothing
 * about Auth. An account that was pre-registered and never claimed has a
 * Firestore doc but no sign-in identity — it cannot log in, and it has no
 * password to reset. Rendering it as "Active" hid that completely, and the
 * console offered a Send Password Reset action that could never succeed.
 *
 * Only the server can answer this, so the list asks here after loading.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withCors } from '@/lib/api-cors';
import { requireAdminContext } from '@/lib/admin-auth';
import { hasPermission } from '@/lib/admin-roles';

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status });
}

// getUsers() accepts at most 100 identifiers per call.
const CHUNK = 100;

const bodySchema = z.object({
  emails: z.array(z.string().trim()).max(1000),
});

async function handlePost(request: NextRequest) {
  try {
    const ctx = await requireAdminContext(request);
    if (!ctx.ok) return ctx.response;
    const { auth, role } = ctx;

    if (!hasPermission(role, 'users:view')) {
      return json({ error: 'You do not have permission to view users.' }, 403);
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return json({ error: 'Invalid request body.' }, 400);
    }
    const parsed = bodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return json({ error: 'An `emails` array is required.' }, 400);
    }

    // Normalise and de-duplicate; Auth lookups are case-insensitive but the
    // caller matches on what it sent, so key everything lowercase.
    const emails = [
      ...new Set(
        parsed.data.emails
          .map(e => e.trim().toLowerCase())
          .filter(e => e.length > 0)
      ),
    ];

    const withAuth: string[] = [];
    for (let i = 0; i < emails.length; i += CHUNK) {
      const chunk = emails.slice(i, i + CHUNK);
      const result = await auth.getUsers(chunk.map(email => ({ email })));
      result.users.forEach(u => {
        if (u.email) withAuth.push(u.email.toLowerCase());
      });
    }

    return json({ withAuth }, 200);
  } catch (error) {
    console.error('[POST /api/admin/users/auth-status]', error);
    return json({ error: 'An unexpected error occurred.' }, 500);
  }
}

export const POST = withCors(handlePost);
