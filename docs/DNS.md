# DNS for xtrafleet.com

Written because nothing in this repo recorded where the `xtrafleet.com` zone
lives or which records matter — the question came up while assessing two
Google Cloud DNS change notices (see *Cloud DNS changes* at the bottom) and
could not be answered from the codebase.

## What depends on DNS

Two things, both on the apex domain `xtrafleet.com`:

| Consumer | What it needs | Where it's set in this repo |
|---|---|---|
| **Firebase App Hosting** (production site) | Apex records pointing at the App Hosting backend | `apphosting.yaml` → `NEXT_PUBLIC_APP_URL: https://xtrafleet.com` |
| **Resend** (transactional email) | Sending-domain auth: SPF, DKIM, ideally DMARC | `src/lib/email.ts`, `src/lib/send-notification-email.ts`, `src/lib/actions.ts`, `src/app/api/add-new-driver/route.ts`, `src/app/api/add-drivers-bulk/route.ts` |

QA does **not** have its own domain — it serves from
`xtrafleet-qa--xtrafleet-qa.us-central1.hosted.app`, which is Google-managed
and needs no DNS from us.

### Email: both environments send as `@xtrafleet.com`

The `from` addresses are hardcoded, not environment-derived:

- `noreply@xtrafleet.com` — `src/lib/email.ts` (`FROM_EMAIL`), `src/lib/actions.ts`, both driver-invite API routes
- `notifications@xtrafleet.com` — `src/lib/send-notification-email.ts`

QA uses the same addresses (and its own `RESEND_API_KEY` secret, per
`apphosting.qa.yaml`). So **QA email deliverability rides on the production
domain's DNS records.** Nothing separate to configure — but a change to the
SPF/DKIM records breaks sending in both environments at once, and a test
email from QA is indistinguishable from a production one to the recipient.

## Where the zone lives

**Cloud DNS.** Confirmed 2026-09-03:

```
$ dig +short NS xtrafleet.com
ns-cloud-e1.googledomains.com.
ns-cloud-e2.googledomains.com.
ns-cloud-e3.googledomains.com.
ns-cloud-e4.googledomains.com.
```

`ns-cloud-*.googledomains.com` is the Cloud DNS nameserver set, so records
are edited in the Google Cloud console (or `gcloud dns`), **not** at a
registrar's DNS panel.

Two things still worth writing down when someone has the consoles open:

- **Which project and zone.** Almost certainly the production project, but
  read it rather than assume:
  `gcloud dns managed-zones list --project=studio-5112915880-e9ca2 --format="table(name,dnsName,visibility)"`
- **The registrar.** Where the domain is *registered* is separate from where
  its DNS is *served*, and only the nameservers are established above. Google
  Domains was sold to Squarespace in 2023, so a domain originally registered
  there now renews at Squarespace while still delegating to Cloud DNS. This
  matters for renewals and transfers, not for records.

## Records that matter

Each record's correct *value* comes from the console named in the last
column; the record itself is then created in **Cloud DNS** (that split trips
people up — Firebase and Resend tell you what to publish, they don't publish
it). This is a checklist of what must exist, so a missing record is
recognisable:

| Record | Type | Purpose | Read the correct value from |
|---|---|---|---|
| `xtrafleet.com` | `A` (or `CNAME`) | Points the apex at the App Hosting backend | Firebase Console → App Hosting → your backend → Custom domains |
| `xtrafleet.com` | `TXT` | SPF, authorising Resend to send | Resend → Domains → `xtrafleet.com` |
| `resend._domainkey.xtrafleet.com` (selector may differ) | `TXT`/`CNAME` | DKIM signing | Resend → Domains → `xtrafleet.com` |
| `_dmarc.xtrafleet.com` | `TXT` | DMARC policy | Your choice; start at `p=none` and review reports |
| `xtrafleet.com` | `TXT` | Any Firebase/Google site-verification token | Firebase Console → Hosting/App Hosting → Domains |

Only **one** SPF `TXT` record may exist on the apex — multiple SPF records
are a hard failure, not a merge. If another sender is ever added, extend the
existing record's `include:` list rather than adding a second record.

## Inspecting the current records

```bash
# Full zone inventory (zone name from the command above)
gcloud dns record-sets list --zone=<zone-name> --project=studio-5112915880-e9ca2

# Per-type, via public resolvers — works regardless of who hosts the zone
dig +short xtrafleet.com A
dig +short xtrafleet.com AAAA
dig +short xtrafleet.com TXT          # SPF + verification tokens
dig +short _dmarc.xtrafleet.com TXT
dig +short resend._domainkey.xtrafleet.com TXT
```

Do not use `dig xtrafleet.com ANY` to get an overview — see below.

## Health checks that already exist

- `scripts/check-domain-health.sh` compares what `https://xtrafleet.com` and
  the Firebase domain actually serve (HTTP + content hash). It does **not**
  query DNS, so it detects a misdirected domain by its symptom, not its
  cause.
- `.github/workflows/deploy-drift.yml` polls each environment's
  `/api/version` over HTTP every 30 minutes. Also DNS-independent.

Neither would tell you a DKIM record had been deleted. Email failures show up
in the Resend dashboard, not in CI.

## Cloud DNS changes effective January 5, 2027

Cloud DNS is authoritative for this domain (above), so both notices land on
our zone. Both were assessed against this codebase; **neither requires a
change here.**

### 1. CNAME chasing across public and private zones

**No effect.** This only changes resolution where a private zone, a response
policy, or Compute Engine internal DNS exists to chase *into*. XtraFleet has
no VPC, no Compute Engine instances, and — as far as the repo shows — no
private zones or response policies: everything it resolves is public
(`xtrafleet.com`, `*.hosted.app`, `*.firebaseapp.com`, Stripe, Resend,
Upstash). With nothing in the private class, public-to-private chasing has
nowhere to go.

Worth one command to confirm, since it was never verified against the live
project — both should come back empty:

```bash
gcloud dns managed-zones list --project=studio-5112915880-e9ca2 \
  --filter="visibility=private" --format="table(name,dnsName)"
gcloud dns response-policies list --project=studio-5112915880-e9ca2
```

### 2. `ANY` queries return one record set instead of all (RFC 8482)

**Applies to our zone, but breaks nothing.** No automation here issues `ANY`
queries: no `dig`/`nslookup`/`host` in `scripts/` or `.github/workflows/`, no
`node:dns` import or DNS library in `src/`, `tests/`, or `package.json`. The
site and email are unaffected either way — browsers and mail servers query
specific types (`A`, `MX`, `TXT`), never `ANY`.

The only thing that changes is a **manual habit**: after 2027-01-05,
`dig xtrafleet.com ANY` returns a single record set rather than an overview
of the zone. Use the per-type `dig` commands or
`gcloud dns record-sets list` above instead.

There is also an upside worth knowing: because Cloud DNS applies this at the
authoritative layer, the domain gets DNS amplification/reflection protection
with no configuration from us.
