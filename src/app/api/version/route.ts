/**
 * Public build-provenance endpoint (DEV-200).
 *
 * Answers one question: which commit is this environment actually serving?
 *
 * During the Aug 2026 rollout failures production served a day-old build for
 * ~24h while two merges to `main` sat undeployed and were believed live. The
 * site was healthy the whole time — Cloud Run keeps the last good revision —
 * so nothing surfaced it. `.github/workflows/deploy-drift.yml` polls this
 * endpoint and alerts when it falls behind the branch it deploys from.
 *
 * Deliberately unauthenticated. The drift check runs on a schedule with no
 * Firebase credentials, and gating this would mean provisioning a service
 * account for the one job whose entire purpose is to work when deploys don't.
 * The response carries only build metadata — a commit SHA, a Cloud Run
 * revision name, and the environment label. No user data, no configuration
 * values, no secrets, and nothing that widens the surface of a private repo:
 * a commit hash is not a credential and grants no access without the repo.
 */
import { NextResponse } from 'next/server';

// Never prerender — the whole point is to report the running instance.
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      // Inlined at build time by next.config.js. 'unknown' means the builder
      // exposed no commit — treat that as a broken check, not a passing one.
      sha: process.env.NEXT_PUBLIC_BUILD_SHA || 'unknown',
      shaSource: process.env.NEXT_PUBLIC_BUILD_SHA_SOURCE || 'unknown',
      builtAt: process.env.NEXT_PUBLIC_BUILD_TIME || null,

      // Set by Cloud Run at runtime; identifies the serving revision, which
      // is what the App Hosting console lists against each rollout.
      revision: process.env.K_REVISION || null,

      environment: process.env.NEXT_PUBLIC_ENV || 'unknown',
      servedAt: new Date().toISOString(),
    },
    {
      status: 200,
      // A cached answer here would defeat the check entirely.
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    }
  );
}
