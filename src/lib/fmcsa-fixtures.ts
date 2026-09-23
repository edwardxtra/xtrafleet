/**
 * Fixture-backed FMCSA lookups for the E2E suite.
 *
 * WHY THIS EXISTS
 *
 * `runComplianceGate()` calls the live FMCSA APIs synchronously during match
 * formation. That is deliberate and is one of the claim-supporting invariants
 * in DEV-157 — no caching, no nightly refresh. It also means CI, which has no
 * `FMCSA_WEB_KEY`, can only ever observe the blocked path: an unreachable
 * FMCSA degrades every carrier to `Unverified`, which the gate refuses.
 *
 * So the happy path was untestable. The fix is a seam, not a mock of the gate:
 * the gate still calls `lookupByDOT` synchronously and still makes its own
 * decision from the result. Only the transport underneath is swapped for
 * recorded responses. The invariant under test is preserved.
 *
 * SAFETY
 *
 * Two independent conditions must both hold before a fixture is ever served:
 *   1. `FMCSA_FIXTURE_MODE === '1'` — never set in apphosting.yaml or
 *      apphosting.qa.yaml, only in playwright.config.ts and e2e.yml.
 *   2. `NODE_ENV !== 'production'` — production builds cannot opt in even if
 *      the variable leaks into the environment.
 *
 * If you ever need fixtures in a production-like build, do not relax this.
 * Add a separate, explicitly-named environment instead.
 */

import type { FMCSACarrier, FMCSALookupResult } from './fmcsa';

/**
 * Both conditions, checked at call time rather than module load, so a test can
 * flip the variable between cases without re-importing.
 */
export function isFmcsaFixtureMode(): boolean {
  return process.env.FMCSA_FIXTURE_MODE === '1' && process.env.NODE_ENV !== 'production';
}

/** Shape of a fixture file on disk. */
export interface FmcsaFixture {
  /** Why this fixture exists and what a test should use it for. */
  description?: string;
  /** When false, the lookup reports failure — models "not in FMCSA records". */
  success: boolean;
  error?: string;
  carrier?: FMCSACarrier;
}

function fixtureDir(): string {
  return process.env.FMCSA_FIXTURE_DIR || 'tests/e2e/fixtures/fmcsa';
}

/**
 * Serve a recorded response for a DOT number.
 *
 * A DOT with no fixture returns the same shape the real API returns for an
 * unknown carrier, so "this carrier isn't in FMCSA" stays testable without
 * inventing a third state.
 */
export async function lookupFromFixture(cleanedDot: string): Promise<FMCSALookupResult> {
  const { readFile } = await import('node:fs/promises');
  const path = await import('node:path');

  const file = path.join(process.cwd(), fixtureDir(), `${cleanedDot}.json`);

  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch {
    return { success: false, error: 'DOT number not found in FMCSA records' };
  }

  let fixture: FmcsaFixture;
  try {
    fixture = JSON.parse(raw) as FmcsaFixture;
  } catch (err) {
    // A malformed fixture is a test-authoring bug. Fail loudly rather than
    // silently degrading to "unverified", which would look like a product bug.
    throw new Error(
      `[fmcsa-fixtures] ${file} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!fixture.success) {
    return { success: false, error: fixture.error || 'DOT number not found in FMCSA records' };
  }

  if (!fixture.carrier) {
    throw new Error(`[fmcsa-fixtures] ${file} has success:true but no carrier object.`);
  }

  return { success: true, carrier: fixture.carrier, raw: fixture.carrier };
}
