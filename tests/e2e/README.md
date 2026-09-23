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
| `01-owner-signup.spec.ts` | New owner can sign up, lands on `/create-profile`, navigating to `/dashboard` doesn't bounce to `/login` (the session-cookie/Auth desync regression). Login form rejects unknown accounts without crashing the error boundary. An owner can sign out and log back in (login success path). An unauthenticated visitor is redirected from `/dashboard` to `/login`. |
| `02-self-driver-onboarding.spec.ts` | **Core:** OO can "Add Myself as Driver" and the record shows in the drivers list with the Owner-Driver badge. **`test.fixme`:** completing the full driver profile + Verified attestation — fixme'd because it drives runtime-dependent Radix `<Select>` markup; un-fixme once the suite runs green. |
| `03-post-load-matches.spec.ts` | **Core:** a profile-incomplete owner is blocked from posting a load AND from the match marketplace (`/dashboard/matches`) by the DEV-154 Layer-2 attestation gate. **`test.fixme`:** full post-load → visible on `/dashboard/loads` + Find Match — fixme'd because it needs a profile-attestation emulator seed step. |

## Known follow-ups (the `test.fixme` blocks)

These need a live run + small additions before they can be un-fixme'd:
- A `tests/e2e/seed.ts` helper that writes `profileInsurance` + `profileAuthority` attestations onto an owner doc so the load-post gate lets the form render.
- Verified Radix `<Select>` option selectors for `cdlState` / `cdlClass` in the driver profile form.

## What's NOT covered at all (yet)

- Two-fleet match request → accept → TLA sign flow (T4 + T5). Multi-context / multi-Firebase-user complexity; a follow-up once the single-account harness is stable.
- Email send paths (Resend is mocked-out via empty `RESEND_API_KEY`).
- Stripe billing / Radar geocoding (intentionally bypassed to keep the suite hermetic).

## Important: the `webframeworks` experiment

`firebase.json` has a `hosting` block with `frameworksBackend`. `firebase emulators:*` parses the whole config and refuses to run unless the `webframeworks` experiment is enabled — even with `--only=auth,firestore`. The `npm run emulators` script enables it automatically (`firebase experiments:enable webframeworks &&`), and the CI workflow has an explicit step for it. It's an idempotent per-machine config write.

## Adding a new spec

1. Reuse `tests/e2e/helpers.ts` for shared signup / profile boilerplate.
2. Prefer role + label selectors (`getByLabel`, `getByRole`) over `data-testid` — they survive component reskins better. Only fall back to a testid when the existing markup is ambiguous (multiple buttons with the same accessible name, or non-standard custom triggers).
3. Mutate state freely — the emulator wipes between runs. **Don't** add cross-spec dependencies; each spec should sign up its own owner.

## CI

`.github/workflows/e2e.yml` runs the full suite on every PR targeting `qa` or `main`. The Playwright HTML report is uploaded as an artifact on every run (passing or failing); look for `playwright-report` in the workflow artifacts when investigating a failure.

## Seeding (`seed.ts`)

Driving every precondition through the UI is why most of this suite was
disabled: reaching "an owner with a compliant driver and a posted load" took a
dozen fragile steps before a test asserted anything. The CI job already exports
`FIRESTORE_EMULATOR_HOST` and `FIREBASE_AUTH_EMULATOR_HOST` into the test
process, so `seed.ts` writes that state directly with the Admin SDK.

```ts
const owner  = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
const driver = await seedDriver(owner.uid, { compliance: 'green' });
await logInAs(page, owner.email, owner.password);
```

Presets are verified against the real scorer — `green`/`yellow`/`red` produce
exactly those results from `getComplianceStatus()`. Attestations are built with
the production `buildAttestationEntry()` helper, so a change to attestation text
or version cannot silently desync the suite from what `/api/register` writes.

**Seed preconditions, never the subject.** A test for "posting a load shows it
on /dashboard/loads" must post through the UI; seeding the load would assert
nothing. `seedLoad` is for tests where a load is setup for something else.

## FMCSA fixtures

`runComplianceGate()` calls FMCSA synchronously during match formation — a
claim-supporting invariant from DEV-157, not an accident. CI has no
`FMCSA_WEB_KEY`, so every carrier used to resolve `Unverified` and only the
blocked path was reachable.

`FMCSA_FIXTURE_MODE=1` (set in `playwright.config.ts` and `e2e.yml`) swaps the
transport under `lookupByDOT()` for recorded responses. The gate still calls,
still decides — only the network hop is replaced. Pick a carrier's outcome with
`FIXTURE_DOT.clean` / `.revoked` / `.discrepancy` / `.unknown`; see
`fixtures/fmcsa/README.md`.

The mode cannot activate in production: it requires the flag **and**
`NODE_ENV !== 'production'`, asserted in `src/lib/__tests__/fmcsa-fixtures.test.ts`.

## Running locally

```bash
npm run test:e2e      # under `firebase emulators:exec`, see package.json
```

If Playwright's bundled browser version does not match what is installed
locally, pass `--config` with a `launchOptions.executablePath` override rather
than editing `playwright.config.ts` — CI installs its own browsers.
