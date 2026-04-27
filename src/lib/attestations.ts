/**
 * Attestation registry, types, and helpers for the staged-attestation model
 * (DEV-154). Replaces the prior scattered shapes:
 *   consents.userAgreement / consents.esignAgreement (signup)
 *   complianceAttestations.* + onboardingStatus.complianceAttested (onboarding)
 *   dqfCertification (driver bulk add)
 *   fmcsaClearinghouse.* (clearinghouse designation)
 *   TLA.lessor/lesseeSignature.consentToEsign (TLA signing)
 *
 * Storage:
 *   owner_operators/{uid}.attestations: AttestationEntry[]    (append-only)
 *
 * Versioning:
 *   - Each registry entry has `v`, the current version.
 *   - Cosmetic / typo changes silent-bump the version (no re-prompt).
 *   - Material changes bump v AND re-prompt at next sensitive action because
 *     hasCurrent() compares stored version to ATTESTATIONS[type].v.
 *
 * Skippability:
 *   - Each registry entry declares whether it's blocking at its surface.
 *     Phase 1 only ships the foundation; consumer surfaces (signup, profile
 *     marketplace gate, driver-add, match-confirm) are wired in later phases.
 */

export type AttestationType =
  // Signup
  | 'signupAuthorized'
  // Profile completion (light, gates marketplace access — Phase 3)
  | 'profileInsurance'
  | 'profileAuthority'
  // Driver addition (per-driver, Phase 3)
  | 'driverDqf'
  | 'driverFmcsaChecks'
  | 'driverAuthority'
  // Match confirmation — Fleet B (borrower) — Phase 2
  | 'matchBorrowerClearinghouse'
  | 'matchBorrowerResponsibility'
  | 'matchBorrowerInsurance'
  // Match confirmation — Fleet A (lender) — Phase 2
  | 'matchLenderQualified'
  | 'matchLenderAuthority'
  // TLA execution — Phase 4
  | 'tlaEsignConsent'
  // Post-trip (optional) — Phase 5
  | 'postTripCompleted'
  | 'postTripNoIncidents';

export interface AttestationDef {
  /** Current version. Bumped only on material wording changes. */
  v: number;
  /** Exact text shown to the user. Snapshotted into each AttestationEntry on accept. */
  text: string;
  /** Where this attestation is captured. Used by audit views. */
  surface:
    | 'signup'
    | 'profile'
    | 'driver_add'
    | 'match_confirm_borrower'
    | 'match_confirm_lender'
    | 'tla'
    | 'post_trip';
  /**
   * Whether the attestation must be accepted to proceed at its surface.
   * Phase 1 declares the intent; the consuming surface enforces it.
   */
  blocking: boolean;
}

export const ATTESTATIONS: Record<AttestationType, AttestationDef> = {
  signupAuthorized: {
    v: 1,
    text: 'I confirm I am authorized to act on behalf of this company.',
    surface: 'signup',
    blocking: true,
  },
  profileInsurance: {
    v: 1,
    text: 'We maintain required insurance coverage.',
    surface: 'profile',
    blocking: true,
  },
  profileAuthority: {
    v: 1,
    text: 'We operate under valid DOT authority.',
    surface: 'profile',
    blocking: true,
  },
  driverDqf: {
    v: 1,
    text: 'This driver is qualified under our Driver Qualification File (DQF).',
    surface: 'driver_add',
    blocking: true,
  },
  driverFmcsaChecks: {
    v: 1,
    text: 'We have conducted required checks under FMCSA regulations.',
    surface: 'driver_add',
    blocking: true,
  },
  driverAuthority: {
    v: 1,
    text: 'Driver is eligible to operate under our authority.',
    surface: 'driver_add',
    blocking: true,
  },
  matchBorrowerClearinghouse: {
    v: 1,
    text: 'We have conducted or will conduct the required Clearinghouse full query if applicable.',
    surface: 'match_confirm_borrower',
    blocking: true,
  },
  matchBorrowerResponsibility: {
    v: 1,
    text: 'We accept responsibility for operating compliance during this trip.',
    surface: 'match_confirm_borrower',
    blocking: true,
  },
  matchBorrowerInsurance: {
    v: 1,
    text: 'We confirm insurance coverage applies to this operation.',
    surface: 'match_confirm_borrower',
    blocking: true,
  },
  matchLenderQualified: {
    v: 1,
    text: 'Driver remains qualified and in good standing.',
    surface: 'match_confirm_lender',
    blocking: true,
  },
  matchLenderAuthority: {
    v: 1,
    text: 'Driver is authorized to operate under the agreed authority structure.',
    surface: 'match_confirm_lender',
    blocking: true,
  },
  tlaEsignConsent: {
    v: 1,
    text: 'I consent to use electronic signatures and understand my electronic signature is legally binding.',
    surface: 'tla',
    blocking: true,
  },
  postTripCompleted: {
    v: 1,
    text: 'Trip was completed under agreed terms.',
    surface: 'post_trip',
    blocking: false,
  },
  postTripNoIncidents: {
    v: 1,
    text: 'No compliance incidents occurred.',
    surface: 'post_trip',
    blocking: false,
  },
};

export interface AttestationContext {
  /** Match doc id, when the attestation is per-match. */
  matchId?: string;
  /** Driver doc id, when per-driver and the driver already has a uid. */
  driverId?: string;
  /**
   * Driver invitation token (driver_invitations doc id) when the attestation
   * is captured at invite time, before the driver registers and gets a uid.
   * Audit trails can later resolve this to the driver's eventual uid.
   */
  driverInvitationToken?: string;
  /** Email of the invitee, captured at invite time for audit clarity. */
  driverInvitationEmail?: string;
  /** TLA doc id, when per-TLA. */
  tlaId?: string;
}

export interface AttestationEntry {
  type: AttestationType;
  /** Version stored at acceptance time. May be older than ATTESTATIONS[type].v. */
  version: number;
  /** Exact text the user saw at acceptance time (snapshot). */
  text: string;
  /** ISO8601. */
  acceptedAt: string;
  /** uid of the user who accepted (multi-admin support later). */
  acceptedBy: string;
  ip?: string;
  userAgent?: string;
  /** Optional entity binding when the attestation is transactional. */
  context?: AttestationContext;
}

/**
 * Build an AttestationEntry for the given type using the current registry.
 * Caller is responsible for persisting via Firestore arrayUnion or similar.
 *
 * Server-side callers can pass ip / userAgent extracted from the request.
 */
export function buildAttestationEntry(
  type: AttestationType,
  acceptedBy: string,
  opts: {
    ip?: string;
    userAgent?: string;
    context?: AttestationContext;
  } = {},
): AttestationEntry {
  const def = ATTESTATIONS[type];
  return {
    type,
    version: def.v,
    text: def.text,
    acceptedAt: new Date().toISOString(),
    acceptedBy,
    ip: opts.ip,
    userAgent: opts.userAgent,
    context: opts.context,
  };
}

/**
 * Does this user already have a current-version attestation for the given
 * type (and matching context, if provided)? Used by gating logic to decide
 * whether to re-prompt.
 *
 * Re-prompting on version bump:
 *   - If def.v is bumped, every existing entry has version < def.v and this
 *     returns false until the user re-accepts.
 *
 * Context match semantics:
 *   - If `context` is omitted, ANY entry of the type counts.
 *   - If `context` is provided, every property in `context` must match the
 *     stored entry's context exactly. Useful for per-match / per-driver checks.
 */
export function hasCurrent(
  attestations: AttestationEntry[] | undefined,
  type: AttestationType,
  context?: AttestationContext,
): boolean {
  if (!attestations || attestations.length === 0) return false;
  const def = ATTESTATIONS[type];
  return attestations.some(a => {
    if (a.type !== type) return false;
    if (a.version !== def.v) return false;
    if (!context) return true;
    if (!a.context) return false;
    return (Object.keys(context) as Array<keyof AttestationContext>).every(
      k => a.context?.[k] === context[k],
    );
  });
}

/**
 * Filter attestations to a single surface. Useful for "Attestations on file"
 * display sections in the profile / admin views.
 */
export function attestationsForSurface(
  attestations: AttestationEntry[] | undefined,
  surface: AttestationDef['surface'],
): AttestationEntry[] {
  if (!attestations) return [];
  return attestations.filter(a => ATTESTATIONS[a.type]?.surface === surface);
}
