import { NextRequest, NextResponse } from 'next/server';

/**
 * The owner-operator assistant endpoint (DEV-151, Half A).
 *
 * Order matters here:
 *   1. Authenticate — we need the uid before anything else, because the uid
 *      IS the data boundary (the agent's tools are bound to it).
 *   2. Guard — rate limit and input cap before a model is touched (DEV-174).
 *   3. Answer.
 *
 * The agent reads only the caller's own fleet. It cannot write, and it
 * cannot see another carrier's data — see src/ai/tools/owner-tools.ts.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  try {
    const { authenticateRequest } = await import('@/lib/api-auth');
    const { guardAiRequest } = await import('@/lib/ai-guard');
    const { askOwnerAgent } = await import('@/ai/flows/capacity-agent');

    let uid: string;
    try {
      const user = await authenticateRequest(request);
      uid = user.uid;
    } catch {
      return json({ error: 'You must be signed in.' }, 401);
    }

    const body = await request.json().catch(() => null);
    const question = typeof body?.question === 'string' ? body.question.trim() : '';
    if (!question) {
      return json({ error: 'Ask a question.' }, 400);
    }

    const guard = await guardAiRequest({
      kind: 'capacityAgent',
      request,
      userId: uid,
      prompt: question,
    });
    if (!guard.ok) {
      return json({ error: guard.error }, guard.status);
    }

    const result = await askOwnerAgent({ ownerId: uid, question });
    return json(result);
  } catch (error) {
    // The model's own failures (no output, upstream error) land here. Keep
    // the detail in the log, not in the response — an agent error message is
    // not something a carrier needs to read.
    console.error('[POST /api/agent]', error);
    return json({ error: 'The assistant could not answer that right now.' }, 500);
  }
}
