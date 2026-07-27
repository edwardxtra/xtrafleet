import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest config for Firestore-rules integration tests.
 *
 * Rules tests need the Firestore emulator running, so they live in their
 * own config and are invoked via `firebase emulators:exec`. Pure unit
 * tests stay in `vitest.config.ts` and run without the emulator.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**'],
    globals: false,
    // Rules tests bring up a connection per suite — serialize.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 20000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
