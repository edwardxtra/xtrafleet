# FMCSA fixtures

Recorded-shape responses served to `lookupByDOT()` when `FMCSA_FIXTURE_MODE=1`
and `NODE_ENV !== 'production'`. See `src/lib/fmcsa-fixtures.ts`.

One file per DOT number, named `<dot>.json`. **A DOT with no fixture returns
"not found"**, which is the same shape the live API returns for an unknown
carrier — so the unverifiable-carrier path stays testable without a fourth
state.

| DOT | Drives | Gate outcome |
|---|---|---|
| `1000001` | Active authority, no discrepancy | Green — match allowed |
| `2000002` | Inactive authority | Red — match blocked |
| `3000003` | QCMobile active, SAFER inactive | Yellow — allowed, flagged |
| *(any other)* | No fixture on disk | Unverified — match blocked |

## These are hand-authored, not captured

They were written against the `FMCSACarrier` shape in `src/lib/fmcsa.ts`, not
recorded from a live QCMobile call — CI has no `FMCSA_WEB_KEY`. That is enough
to exercise every branch of `checkCarrier()`, which is what the E2E suite needs.

It is **not** a substitute for testing the parser against real payloads. That
job belongs to `src/lib/__tests__/fmcsa-parse.test.ts`, which works on captured
API and SAFER HTML shapes. If the live API changes its field names, these
fixtures will not catch it and are not meant to — the parse tests are.

To add a case: copy a file, change the DOT and the fields that matter to the
branch you want, and note the intended outcome in `description`.
