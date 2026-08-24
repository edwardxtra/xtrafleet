/**
 * Build provenance for the deploy-drift check (DEV-200).
 *
 * Resolves the commit this bundle was built from so the running app can
 * report it at /api/version, and a scheduled job can compare that against
 * the tip of `main`. Production served a day-old build during the Aug 2026
 * rollout failures with nothing to surface it; this is the signal that
 * makes "shipped" verifiable instead of assumed.
 *
 * Resolution order, most to least trustworthy:
 *   1. COMMIT_SHA        — set by Cloud Build (Firebase App Hosting builds)
 *   2. GITHUB_SHA        — set by GitHub Actions
 *   3. `git rev-parse`   — local builds, and any builder that keeps .git
 *   4. 'unknown'         — reported as such rather than guessed
 *
 * `source` is returned alongside the sha on purpose. If App Hosting builds
 * turn out to strip .git AND not set COMMIT_SHA, the endpoint says
 * source: "unknown" and the drift workflow fails loudly on its first run,
 * rather than comparing a placeholder forever and reporting all-clear.
 */
const { execFileSync } = require('child_process');

function resolveSha() {
  if (process.env.COMMIT_SHA) return { sha: process.env.COMMIT_SHA, source: 'cloud-build' };
  if (process.env.GITHUB_SHA) return { sha: process.env.GITHUB_SHA, source: 'github-actions' };
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).trim();
    if (sha) return { sha, source: 'git' };
  } catch {
    // No git binary, no .git directory, or not a repo. Fall through.
  }
  return { sha: 'unknown', source: 'unknown' };
}

function getBuildInfo() {
  const { sha, source } = resolveSha();
  return {
    sha,
    shaSource: source,
    // Stamped when next.config.js is evaluated, which for a deployed bundle
    // is build time. Lets the drift check tell a stale deploy from a slow one.
    builtAt: new Date().toISOString(),
  };
}

module.exports = { getBuildInfo };
