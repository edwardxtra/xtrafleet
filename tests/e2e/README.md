# XtraFleet E2E suite

Playwright driving a real browser against the local Firebase Auth + Firestore
emulators. No external services are required — Stripe, Resend and Radar are
stubbed or bypassed so the suite is hermetic.

## One-time setup

```bash
npm install                        # Playwright, firebase-tools and the rest
npx playwright install chromium    # the browser Playwright drives
```

Order matters. `npx playwright install` before `npm install` fetches a throwaway
copy of Playwright into the npx cache and then fails to resolve
`@playwright/test` from the config.

You also need Java — the emulators bundle Cloud Firestore as a JAR. Most macOS
and Linux dev machines already have it; CI provisions Temurin 17.

## Running the suite

Two terminals. The first stays running:

```bash
# terminal 1 — emulators
npm run emulators

# terminal 2 — tests
npm run test:e2e
```

`npm run test:e2e` is `playwright test`, nothing more. Playwright starts
`npm run dev` itself as a sub-process; you only start the emulators.

The Emulator UI at <http://127.0.0.1:4000> is the most useful window when a test
surprises you — it is a live browser for the data the suite is writing.

### Or in one command

```bash
npx firebase emulators:exec --only=auth,firestore --project xtrafleet-e2e \
  "npm run test:e2e"
```

Starts the emulators, runs the suite, tears them down. This is what CI does.
Don't run it while `npm run emulators` is up — they fight over port 8080.

### Variants

```bash
npm run test:e2e:ui                                 # UI runner — start here
npm run test:e2e:headed                             # visible browser window
npx playwright test tests/e2e/01-owner-signup.spec.ts   # one file
npx playwright test -g "rejects an unknown account"      # one test, by name
npx playwright test --debug -g "..."                     # step through it
```

`--ui` is worth learning first: a timeline of every action with a DOM snapshot
at each step, a locator picker, and per-test re-runs.

### Why the config sets emulator env vars at module load

`playwright.config.ts` assigns `FIRESTORE_EMULATOR_HOST`,
`FIREBASE_AUTH_EMULATOR_HOST` and `GCLOUD_PROJECT` on `process.env` before
exporting the config. That is not redundant with the `webServer.env` block.

`webServer.env` reaches the Next.js process Playwright spawns. But spec files
import `seed.ts` and run it **in the test runner's own process**, and `seed.ts`
reads those variables from there. Without them the first `seedOwner()` throws,
and the two-terminal workflow above cannot work — the suite only ran under
`emulators:exec`, which exports them for the whole command. CI used that, so
nothing was ever red and the gap went unnoticed for months.

`??=` means an explicit value always wins, so `emulators:exec` and non-default
ports both still work.

## What's covered

| Spec | Validates |
|---|---|
| `01-owner-signup` | Signup reaches `/create-profile` and `/dashboard` without bouncing (the session-cookie/Auth desync regression). Unknown accounts are rejected without crashing the error boundary. Sign out → log back in. Unauthenticated visitors are redirected off `/dashboard`. |
| `02-self-driver-onboarding` | An OO can add themselves as a driver. One `test.fixme`: completing the profile to flip the attestation to Verified — it drives runtime-dependent Radix `<Select>` markup. |
| `03-post-load-matches` | The DEV-154 attestation gate lets an onboarded owner through to the load form and the match marketplace. A posted load appears on `/dashboard/loads` and in Find Match. |
| `04-compliance-gate` | The bilateral compliance gate at match formation: both carriers active → forms; either side's authority inactive → 403; not in FMCSA → 422; an outsider cannot accept; a missing `matchId` is rejected before any gate work. |
| `05-stripe-match-fee` | Webhook signature verification (missing, wrong secret, tampered body), the happy path recording payment and flipping the TLA, idempotency on redelivery, and non-match-fee events ignored. |
| `06-admin-auth` | Every admin route refuses anonymous and non-admin callers — and a refused call writes no audit entry and deletes nothing. |
| `07-agent-guard` | The AI entry points: anonymous refused, auth checked **before** input sizing, empty and over-cap questions rejected, just-inside accepted. |
| `08-admin-roles` | Privilege separation: an `admin` is not a `super_admin`. 14 route/role pairs that must refuse, 3 that must allow, and a legacy admin with no `adminRole` is not silently a super admin. |
| `09-marketplace-drivers` | `/api/marketplace/drivers`: anonymous refused, attestation gate enforced, no sensitive field in the response, and it pages. |
| `10-marketplace-loads` | `/api/marketplace/loads` and `/api/commitments`: same gate, no TMS refs leaked, delivered loads off the board, pagination, and commitments carrying a window but none of the negotiation. |
| `11-scorecard-scope` | The score-breakdown panel shows another carrier's driver as a status, never as documents — no CDL number, policy number or document links. |
| `12-marketplace-client-switch` | The browser no longer subscribes to drivers across carriers. Asserts on the Listen channel's `addTarget` payloads, because response bodies on a long-lived WebChannel are not reliably readable. |
| `13-responsive.mobile` | Phone width (Pixel 7). No horizontal overflow, primary controls on screen and not collapsed. Runs only under the `mobile-chromium` project. |
| `14-password-reset` | The reset form answers identically for a registered and an unregistered email — account enumeration. |

## Projects

Two, in `playwright.config.ts`:

- **`chromium`** — desktop, runs everything except `*.mobile.spec.ts`
- **`mobile-chromium`** — Pixel 7, runs only `*.mobile.spec.ts`

The `testIgnore` / `testMatch` pair keeps each spec in exactly one project; the
suite is serial, so running everything twice would be real wall-clock cost for
no extra coverage.

Pixel 7 rather than an iPhone because iOS device descriptors need WebKit, a
second browser download. Safari-specific rendering is therefore **not** covered.

## Writing your first test

A test is just a file. Drop any `*.spec.ts` into `tests/e2e/` and the runner
finds it — there is no registry to update.

```ts
import { test, expect } from '@playwright/test';

test('the terms of service page loads', async ({ page }) => {
  await page.goto('/legal/terms');
  await expect(
    page.getByRole('heading', { name: 'Terms of Service', level: 1 })
  ).toBeVisible();
});
```

That one needs no login and no seeded data. Start there.

Things that bite newcomers:

- **Save the file.** An unsaved VS Code buffer (the ● in the tab) is not on
  disk, and the runner reads the disk.
- **`await` everything.** A missing one lets the test race ahead of the browser.
- **`expect(locator)` retries** until it passes or times out. Reaching for
  `page.waitForTimeout()` is the main cause of flaky tests here.
- **Make it fail on purpose once.** A test you have never seen fail has told you
  nothing. Break the assertion, confirm red, then break the *app* and confirm
  red again — that second one is what proves the test is real.

### Selectors

Prefer role + accessible name (`getByRole`, `getByLabel`) over `data-testid`.
They survive reskins, and they fail when the markup stops being reachable by a
screen reader — a bug worth failing on. Fall back to a testid only when the
markup is genuinely ambiguous.

**A locator that silently matches the wrong element is the most common way a
test here lies to you.** `14-password-reset` documents a real instance: the
toaster mounts an empty `div[role="alert"]` on every page, so a bare
`getByRole('alert')` resolved to it and read an empty string. When a locator
misbehaves, print everything it matched rather than reasoning about it —
UI mode's DOM snapshot does the same job visually.

Note that `level` is on Playwright's shared options type. TypeScript will not
flag `getByRole('link', { level: 1 })`; it compiles and then matches nothing.

### Isolation

Each spec signs up its own owner. **Do not** build cross-spec dependencies.

The emulator is shared and seeding is cumulative, so anything a test later finds
by visible text needs a unique name. `seedDriver`'s default name is unique
already; use `uniqueLabel()` from `seed.ts` for anything else.

This is not theoretical: two specs both seeded a driver called "Marketplace
Driver", a locator took the first match, and the test passed alone and failed in
the suite — looking exactly like a real finding.

## Seeding (`seed.ts`)

Driving every precondition through the UI is why most of this suite was once
disabled: reaching "an owner with a compliant driver and a posted load" took a
dozen fragile steps before a test asserted anything. `seed.ts` writes that state
directly with the Admin SDK.

```ts
const owner  = await seedOwner({ dotNumber: FIXTURE_DOT.clean });
const driver = await seedDriver(owner.uid, { compliance: 'green' });
await logInAs(page, owner.email, owner.password);
```

Presets are verified against the real scorer — `green` / `yellow` / `red`
produce exactly those results from `getComplianceStatus()`. Attestations are
built with the production `buildAttestationEntry()` helper, so a change to
attestation text or version cannot silently desync the suite from what
`/api/register` writes.

**Seed preconditions, never the subject.** A test for "posting a load shows it
on `/dashboard/loads`" must post through the UI; seeding the load would assert
nothing. `seedLoad` is for tests where a load is setup for something else.

`seed.ts` refuses to run without the emulator env vars, so a misconfigured run
cannot write to a real project.

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
`NODE_ENV !== 'production'`, asserted in
`src/lib/__tests__/fmcsa-fixtures.test.ts`.

## The `webframeworks` experiment

`firebase.json` has a `hosting` block with `frameworksBackend`. `firebase
emulators:*` parses the whole config and refuses to run unless the
`webframeworks` experiment is enabled — even with `--only=auth,firestore`. The
`npm run emulators` script enables it automatically; the CI workflow has an
explicit step. It is an idempotent per-machine config write.

## CI

`.github/workflows/e2e.yml` runs the full suite on every PR targeting `qa` or
`main`, under `firebase emulators:exec`. It is a **required** check for `qa`.

The Playwright HTML report is uploaded as an artifact on every run, passing or
failing — look for `playwright-report` in the workflow artifacts.

## Known limitations

- **The emulator does not enforce Firestore indexes.** It runs any valid query,
  so a green suite does not prove a query works in production. This has already
  bitten us once: an index spec that created nothing passed CI for two PRs.
- **Serial only.** `workers: 1`, `fullyParallel: false` — signup flows mutate
  shared emulator state. Parallelism needs per-test Firestore namespacing.
- **No WebKit**, per the device choice above.
- **No component tests.** The unit suite is `environment: 'node'` with no jsdom,
  which is why render-level logic gets extracted into pure modules
  (`scorecard-visibility.ts`) and tested there instead.
- **`/dashboard/drivers/[id]` cannot be tested.** It reports "Driver not found"
  for a seeded driver at the exact path it queries. Pre-existing; unresolved.
- Email send paths are stubbed via an empty `RESEND_API_KEY`; Stripe billing and
  Radar geocoding are bypassed to keep the suite hermetic.
