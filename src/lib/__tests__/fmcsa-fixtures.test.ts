import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isFmcsaFixtureMode, lookupFromFixture } from '@/lib/fmcsa-fixtures';

// vi.stubEnv rather than assigning process.env directly: NODE_ENV is typed
// read-only, and stubbing restores cleanly between cases.
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isFmcsaFixtureMode', () => {
  beforeEach(() => {
    vi.stubEnv('FMCSA_FIXTURE_MODE', '');
    vi.stubEnv('NODE_ENV', 'test');
  });

  it('is off when the flag is unset', () => {
    expect(isFmcsaFixtureMode()).toBe(false);
  });

  it('is on with the flag set outside production', () => {
    vi.stubEnv('FMCSA_FIXTURE_MODE', '1');
    vi.stubEnv('NODE_ENV', 'development');
    expect(isFmcsaFixtureMode()).toBe(true);
  });

  it('CANNOT be enabled in production even with the flag set', () => {
    // The guard that matters. If this test ever fails, a production build can
    // be made to serve fake carrier authority data, which would mean the
    // compliance gate clearing carriers that FMCSA has not verified.
    vi.stubEnv('FMCSA_FIXTURE_MODE', '1');
    vi.stubEnv('NODE_ENV', 'production');
    expect(isFmcsaFixtureMode()).toBe(false);
  });

  it('ignores truthy-but-wrong flag values', () => {
    vi.stubEnv('NODE_ENV', 'development');
    for (const value of ['true', 'yes', '0', '']) {
      vi.stubEnv('FMCSA_FIXTURE_MODE', value);
      expect(isFmcsaFixtureMode()).toBe(false);
    }
  });
});

describe('lookupFromFixture', () => {
  beforeEach(() => {
    vi.stubEnv('FMCSA_FIXTURE_DIR', 'tests/e2e/fixtures/fmcsa');
  });

  it('serves the clean carrier as allowed to operate', async () => {
    const result = await lookupFromFixture('1000001');
    expect(result.success).toBe(true);
    expect(result.carrier?.allowedToOperate).toBe(true);
    expect(result.carrier?.saferDiscrepancy).toBe(false);
    expect(result.carrier?.legalName).toBe('E2E CLEAR FREIGHT LLC');
  });

  it('serves the revoked carrier as not allowed — the Red path', async () => {
    const result = await lookupFromFixture('2000002');
    expect(result.success).toBe(true);
    expect(result.carrier?.allowedToOperate).toBe(false);
  });

  it('serves the discrepancy carrier as allowed but flagged — the Yellow path', async () => {
    const result = await lookupFromFixture('3000003');
    expect(result.success).toBe(true);
    expect(result.carrier?.allowedToOperate).toBe(true);
    expect(result.carrier?.saferDiscrepancy).toBe(true);
  });

  it('reports not-found for a DOT with no fixture', async () => {
    // Same shape the live API returns for an unknown carrier, so the
    // unverifiable-carrier path needs no special casing in tests.
    const result = await lookupFromFixture('9999999');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  describe('malformed fixtures', () => {
    let dir: string;

    beforeEach(async () => {
      dir = await mkdtemp(path.join(tmpdir(), 'fmcsa-fixture-'));
      vi.stubEnv('FMCSA_FIXTURE_DIR', path.relative(process.cwd(), dir));
    });

    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it('throws on invalid JSON rather than degrading to unverified', async () => {
      // Degrading would make a test-authoring mistake look like a product bug:
      // the match would be blocked and the failure would point at the gate.
      await writeFile(path.join(dir, '1111111.json'), '{ not json');
      await expect(lookupFromFixture('1111111')).rejects.toThrow(/not valid JSON/);
    });

    it('throws when success is true but no carrier is present', async () => {
      await writeFile(path.join(dir, '2222222.json'), JSON.stringify({ success: true }));
      await expect(lookupFromFixture('2222222')).rejects.toThrow(/no carrier object/);
    });

    it('honours an explicit failure fixture', async () => {
      await writeFile(
        path.join(dir, '3333333.json'),
        JSON.stringify({ success: false, error: 'FMCSA API error: 503' })
      );
      const result = await lookupFromFixture('3333333');
      expect(result.success).toBe(false);
      expect(result.error).toBe('FMCSA API error: 503');
    });
  });
});
