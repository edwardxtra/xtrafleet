import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for XtraFleet E2E.
 *
 * The suite runs against:
 *   - Next.js dev server on http://localhost:9002 (same port as `npm run dev`)
 *   - Firebase Auth emulator on localhost:9099
 *   - Firestore emulator on localhost:8080
 *
 * Both the client SDK (via NEXT_PUBLIC_USE_FIREBASE_EMULATORS) and the
 * Admin SDK (via FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST)
 * auto-detect emulator mode from env vars set in the webServer command.
 *
 * Local: `npm run emulators` in one terminal, `npm run test:e2e` in another.
 * CI:    the github action boots both inline before running the suite.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // signup flows mutate shared emulator state — keep serial for now
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:9002',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: process.env.E2E_SKIP_WEB_SERVER
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:9002',
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
        env: {
          NEXT_PUBLIC_USE_FIREBASE_EMULATORS: 'true',
          NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'xtrafleet-e2e',
          NEXT_PUBLIC_FIREBASE_API_KEY: 'fake-api-key-for-emulator',
          NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'localhost',
          NEXT_PUBLIC_FIREBASE_APP_ID: '1:000000000000:web:emulator',
          NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'xtrafleet-e2e.appspot.com',
          NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
          // Use 127.0.0.1 (not localhost) — the emulators bind to the IPv4
          // loopback only; `localhost` can resolve to ::1 first and the
          // Admin SDK then fails to reach them.
          FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
          FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
          GCLOUD_PROJECT: 'xtrafleet-e2e',
          // Disable rate-limit + external integrations in tests
          UPSTASH_REDIS_REST_URL: '',
          UPSTASH_REDIS_REST_TOKEN: '',
          RADAR_SECRET_KEY: '',
          RESEND_API_KEY: '',
          STRIPE_SECRET_KEY: '',
        },
      },
});
