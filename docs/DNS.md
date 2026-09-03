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

> **TODO — fill this in.** This could not be determined from the repo, and
> this session's network policy blocks outbound DNS (no `dig`; DNS-over-HTTPS
> to `dns.google` and `cloudflare-dns.com` returns 403 at the proxy), so the
> nameservers could not be read live either.

Answer it with either of these, then replace this section:

```bash
# 1. Who is authoritative? (run from any machine with normal network access)
dig +short NS xtrafleet.com

# 2. Is it a Cloud DNS zone in the prod project?
gcloud dns managed-zones list --project=studio-5112915880-e9ca2 \
  --format="table(name,dnsName,visibility)"
```

- Nameservers like `ns-cloud-*.googledomains.com` **and** a zone listed in
  step 2 → the zone is in **Cloud DNS**, and the Jan 2027 changes below are
  worth a second look.
- Anything else (Cloudflare, Namecheap, GoDaddy, Squarespace, …) → the zone
  is at that registrar/provider, **Cloud DNS is not authoritative for
  `xtrafleet.com`, and neither Cloud DNS change affects us at all.**

Record the answer here, including which account holds the login.

## Records that matter

Authoritative values live in the consoles, not here — this is a checklist of
what must exist, so a missing record is recognisable:

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
# Full zone inventory (only if the zone is in Cloud DNS)
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

Both were assessed against this codebase and are **no-ops for XtraFleet**,
*provided* the zone turns out not to be in Cloud DNS — and still no-ops even
if it is, for the reasons given:

1. **CNAME chasing across public/private zones.** Only affects private zones,
   response policies, and Compute Engine internal DNS. XtraFleet has no VPC,
   no private zones, no response policies, and no Compute Engine instances —
   everything it resolves (`xtrafleet.com`, `*.hosted.app`,
   `*.firebaseapp.com`, Stripe, Resend, Upstash) is public.

2. **`ANY` queries return one record set instead of all** (RFC 8482) in
   public authoritative zones. No automation here issues `ANY` queries: no
   `dig`/`nslookup`/`host` in `scripts/` or `.github/workflows/`, no
   `node:dns` import or DNS library in `src/`, `tests/`, or `package.json`.
   The only impact is on manual troubleshooting habits — use the per-type
   `dig` commands or `gcloud dns record-sets list` above instead of
   `dig ... ANY`.
