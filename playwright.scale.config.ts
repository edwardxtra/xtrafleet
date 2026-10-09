import base from './playwright.config';

/**
 * Config for the marketplace scale benchmark.
 *
 * Separate from playwright.config.ts (testDir ./tests/e2e) so the benchmark
 * never runs in CI: it seeds tens of thousands of documents and takes minutes
 * per step. Run it deliberately with `npm run bench:marketplace`.
 */
export default {
  ...base,
  testDir: './tests/scale',
  timeout: 30 * 60_000,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: 'list' as const,
};
