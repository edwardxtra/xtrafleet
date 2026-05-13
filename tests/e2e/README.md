# XtraFleet E2E suite

Playwright-driven end-to-end tests running against the local Firebase Auth + Firestore emulators. No external services (Stripe, Resend, Radar) are required.

## One-time setup

```bash
npm install                   # installs Playwright, firebase-tools, etc.
npx playwright install chromium
```

You'll also need Java (the emulators bundle Cloud Firestore in a JAR). Most macOS / Linux dev machines already have it; CI provisions Temurin 17.

## Run locally

Two terminals — one for the emulators, one for the test runner:

```bash
# terminal 1
npm run emulators

# terminal 2 (after emulators are listening on :9099 + :8080)
npm run test:e2e
```

The Playwright config boots `npm run dev` as a sub-process and sets `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true` so the client + server SDKs route to the local emulators.

### Useful variants

```bash
npm run test:e2e:ui        # Playwright's UI runner (great for debugging)
npm run test:e2e:headed    # Run against a real, visible browser window
npx playwright test tests/e2e/01-owner-signup.spec.ts   # Single spec
```

## What's covered

| Spec | Validates |
|---|---|
| `01-owner-signup.spec.ts` | New owner can sign up, lands on `/create-profile`, navigating to `/dashboard` doesn't bounce to `/login`. Login form rejects unknown accounts without crashing. |
| `02-self-driver-onboarding.spec.ts` | OO can Add Self as Driver, the self-driver detail surfaces the "Complete Driver Profile" CTA, completing the form clears the banner and flips the Driver Authorization & Disclosure attestation to Verified. |
| `03-post-load-matches.spec.ts` | New load form accepts a same-day pickup date, the posted load appears on `/dashboard/loads`, and shows up in Find Match's My Assets (post-#157 status filter). |

## What's NOT covered (yet)

- Two-fleet match request → accept → TLA sign flow (T4 + T5 in the original plan). Adds multi-context / multi-Firebase-user complexity; planned as a follow-up once the single-account harness is stable.
- Email send paths (Resend is mocked-out via empty `RESEND_API_KEY`).
- Stripe billing / Radar geocoding (intentionally bypassed to keep the suite hermetic).

## Adding a new spec

1. Reuse `tests/e2e/helpers.ts` for shared signup / profile boilerplate.
2. Prefer role + label selectors (`getByLabel`, `getByRole`) over `data-testid` — they survive component reskins better. Only fall back to a testid when the existing markup is ambiguous (multiple buttons with the same accessible name, or non-standard custom triggers).
3. Mutate state freely — the emulator wipes between runs. **Don't** add cross-spec dependencies; each spec should sign up its own owner.

## CI

`.github/workflows/e2e.yml` runs the full suite on every PR targeting `qa` or `main`. The Playwright HTML report is uploaded as an artifact on every run (passing or failing); look for `playwright-report` in the workflow artifacts when investigating a failure.
