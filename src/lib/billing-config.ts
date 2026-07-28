/**
 * Billing feature flags.
 *
 * MATCH_FEE_WAIVED — during the launch free-trial period the $25 per-match
 * fee is not collected. The payment CTA cards were already removed from the
 * TLA page for the trial (see src/app/dashboard/tla/[id]/page.tsx), but
 * startTrip() still required `matchFeePaid === true`, which silently blocked
 * every trip from starting during the trial. This flag keeps the trip gate
 * consistent with the removed UI so a fully-signed TLA can start (and
 * complete) a trip without a payment on file.
 *
 * To re-enable billing when the trial ends:
 *   1. Set MATCH_FEE_WAIVED = false here.
 *   2. Restore the TLAMatchFeeCard / TLAMatchFeePaidCard block in
 *      src/app/dashboard/tla/[id]/page.tsx.
 * The payment route (/api/stripe/create-match-payment) and its webhook remain
 * wired, so re-enabling is those two steps only.
 */
export const MATCH_FEE_WAIVED = true;
