# Document extraction eval (DEV-153)

**Status: evaluation only.** There is no UI, nothing writes to Firestore, and
nothing here touches the compliance gate. This measures whether AI extraction is
accurate enough on *your* documents to be worth building into the product.

## Why an eval and not the feature

DEV-153 estimates 4–5 days for the full scanner. That estimate is only worth
spending if extraction actually works on real XtraFleet documents — phone photos
of medical cards, scanned COIs, faxed authority letters. Most AI pilots skip this
because they have no ground truth to measure against.

You have ground truth: every document already processed by hand has a human-keyed
expiry date sitting next to it. That makes a one-day eval possible, and it answers
the only question that matters before committing the week.

## The question it answers

> At what confidence threshold, if any, is auto-applying an extracted value safe?

Not "how accurate is it." Accuracy hides the failure that matters. The eval
separates three outcomes that a single accuracy number would blend:

| Outcome | Meaning | Cost |
|---|---|---|
| **missed** | Model returned null; a value existed | Someone types it. Fine. |
| **wrong** | Model returned a *different* value | A bad date lands in a compliance record looking authoritative |
| **hallucinated** | Model invented a value where none existed | Same |

`wrong` and `hallucinated` are **silent errors**, and they are the whole risk.
A missed field is visible — the box is empty. A wrong expiry date is invisible
until a driver is cleared for a load they should not have been cleared for.

The prompt is written to prefer nulls over guesses for exactly this reason, and
`normalizeDate()` rejects ambiguous dates rather than picking an interpretation.

## Running it

```bash
mkdir -p eval/documents
cp eval/ground-truth.example.json eval/ground-truth.json
# edit it to describe your documents, and put the files in eval/documents/
npm run eval:docs
```

Options: `--concurrency=N` (default 4), `--limit=N` for a smoke test,
`--out=PATH` for the JSON results.

Needs whatever key `src/ai/genkit.ts` already uses for the googleAI plugin — the
same credential the existing `driver-profile-summary` and `load-description-generator`
flows run on. **No new vendor, no new key, no new data-processing relationship.**

### Ground truth format

```json
[
  {
    "documentId": "coi-001",
    "file": "documents/coi-001.pdf",
    "documentType": "insurance_coi",
    "expiryDate": "2027-03-14",
    "documentNumber": "POL-4471-A",
    "namedParty": "ABC Trucking LLC"
  }
]
```

`file` is relative to the manifest. Use `null` for fields genuinely not on the
document — that is how correct abstention gets measured. Aim for 30+ documents
across the types you actually receive, including a few bad phone photos. The
blurry ones are the point: they are where confidence scoring earns its keep.

**Never commit real documents.** `eval/` is gitignored for this reason.

## Reading the output

**Per field** — correct / wrong / missed / hallucinated / absent, plus recall
(of the values that existed, how many we got) and precision (when we answered,
how often we were right).

**Threshold sweep** — the decision table. For each confidence threshold: how many
fields would be auto-applied, how many of those are silently wrong, and how much
manual entry it removes. A threshold that auto-applies 90% of fields with a 5%
silent-error rate is worse than useless. One that auto-applies 40% with 0% is a
real feature.

**Recommendation** — the lowest threshold with ≤1% silent errors over at least 20
samples. It returns *no recommendation* when nothing qualifies, which is a
legitimate and useful answer: propose every value for review, auto-apply none.

**Silent error detail** — every wrong answer with the model's value next to the
truth. Read all of them. Patterns here tell you whether the fix is a prompt
change (it computed an expiry from an issue date), a preprocessing change (all
failures are one document type), or a "this does not work" verdict.

The script exits non-zero when any silent error occurred, so it can gate CI later
against a fixed fixture set.

## What must not happen next

The compliance gate stays deterministic on QCMobile/SAFER data. Extraction
proposes values for a human to confirm; it never decides whether a driver is
cleared. XtraFleet's defensible claim is synchronous, bilateral, compliance-gated
match formation off authoritative FMCSA data — put a language model's judgment in
that path and the claim becomes probabilistic.

Related: the `checkSAFER()` substring bug is tempting to solve with a model.
Don't. Fix the parser. A model is at best a fallback that flags for review when
parsing fails.

## The cross-check is the actually valuable part

`crossCheckAgainstAuthority()` compares the named party and DOT/MC numbers on the
document against the FMCSA authority record. A certificate whose named insured
does not match the carrier on the authority record is a fraud signal —
double-brokering commonly presents exactly that way.

Saving data entry is convenience. This is the part that is worth something, and
it is also why the prompt says **transcribe, do not correct**: a model that
silently fixes a misspelled carrier name destroys the signal.

It produces review flags, never decisions.

## Deliberately deferred

- Any UI. Review/override screens are part of DEV-153 proper.
- Writing to Firestore. Nothing auto-applies until the threshold is known.
- Coverage limits scoring. Extracted, not yet scored.
- A second AI vendor. Measure the incumbent first; switching later is a Genkit
  plugin change, which is what Genkit is for.
- Voice transcription. Massachusetts and Florida are both all-party consent
  states for call recording, and they are the two GTM corridors in DEV-155.
  That needs legal review before it needs an API key.
