/**
 * The decision a TLA signature makes, as a pure function.
 *
 * This logic used to live only inside signTLA's `runTransaction` callback in
 * tla-actions.ts, alongside network I/O and email side effects, which made it
 * untestable. It is also the piece that was once wrong: the "has the other
 * party signed?" question was answered from the `tla` snapshot captured at
 * page load, so two parties signing concurrently could each read the other as
 * unsigned and the second write would clobber `status` back to `pending_*`,
 * stranding a fully-signed agreement.
 *
 * The transaction is what makes `current` fresh. This function is what decides
 * correctly given fresh data — and keeping it separate means the decision can
 * be checked over every combination, not just the two the happy path walks.
 */
import type { TLA, TLASignature, InsuranceOption } from '@/lib/data';

/** Just the fields of a TLA this decision reads. */
export type SignableTLA = Pick<TLA, 'lessorSignature' | 'lesseeSignature'>;

export interface SignatureDecision {
  /** Whether BOTH signatures are present once this one is applied. */
  bothSigned: boolean;
  /** The status the document should carry after this signature. */
  status: Extract<TLA['status'], 'signed' | 'pending_lessor' | 'pending_lessee'>;
}

export interface ApplySignatureOptions {
  insuranceOption?: InsuranceOption;
  /** Already JSON-sanitised by the caller; passed through untouched. */
  locations?: unknown;
  /** Injectable for tests; defaults to now. */
  now?: () => string;
}

/**
 * Decide the outcome of applying `signature` as `role` to `current`.
 *
 * `current` must come from inside the transaction. Passing a stale snapshot
 * reintroduces exactly the race this exists to prevent.
 */
export function decideSignature(
  current: SignableTLA,
  role: 'lessor' | 'lessee',
  signature: TLASignature,
): SignatureDecision {
  // Resolve both signatures from fresh data, including the one being added.
  const lessorSignature = role === 'lessor' ? signature : current.lessorSignature;
  const lesseeSignature = role === 'lessee' ? signature : current.lesseeSignature;
  const bothSigned = Boolean(lessorSignature) && Boolean(lesseeSignature);

  if (bothSigned) return { bothSigned, status: 'signed' };

  // Exactly one signature exists, and it is necessarily the one just added —
  // so the OTHER party is the one still pending.
  return {
    bothSigned,
    status: lessorSignature ? 'pending_lessee' : 'pending_lessor',
  };
}

/**
 * Build the Firestore update payload for a signature.
 *
 * Returned as a plain object so the transaction body is a single call and the
 * shape of what gets written is inspectable in a test.
 */
export function buildSignatureUpdate(
  current: SignableTLA,
  role: 'lessor' | 'lessee',
  signature: TLASignature,
  opts: ApplySignatureOptions = {},
): { update: Record<string, unknown>; decision: SignatureDecision } {
  const now = opts.now ?? (() => new Date().toISOString());
  const decision = decideSignature(current, role, signature);

  const update: Record<string, unknown> = { updatedAt: now() };

  if (role === 'lessor') {
    update.lessorSignature = signature;
  } else {
    update.lesseeSignature = signature;

    if (opts.insuranceOption) {
      update.insurance = {
        option: opts.insuranceOption,
        confirmedAt: now(),
        confirmedBy: signature.signedBy,
      };
    }
    if (opts.locations) {
      update.locations = opts.locations;
    }
  }

  update.status = decision.status;
  if (decision.bothSigned) update.signedAt = now();

  return { update, decision };
}
