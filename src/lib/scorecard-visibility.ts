/**
 * What a compliance scorecard may show, and what each section concludes.
 *
 * WHY THIS IS A SEPARATE MODULE
 *
 * The scorecard's section dots and overall banner are derived from field
 * PRESENCE. That was fine while every viewer held the whole driver document.
 * It stops being fine the moment some fields are withheld from some viewers,
 * because "absent" then means two opposite things:
 *
 *   - the driver has no CDL on file         -> a problem with the driver
 *   - the CDL number is not yours to see    -> a limit on the viewer
 *
 * Rendered identically, the second reads as the first. A fully compliant
 * driver from another carrier showed "Overall Compliance: Red" and a red CDL
 * dot purely because the number was not in the payload.
 *
 * So the decisions live here, keyed on SCOPE rather than on presence, and they
 * are unit tested. The component renders; this decides.
 */
import type { Driver } from './data';
import type { ComplianceStatus } from './compliance';
import { differenceInDays, parseISO } from 'date-fns';

export const EXPIRY_WARNING_DAYS = 30;

/**
 * How much of the driver's file the viewer is entitled to see.
 *
 * - "full"        — the viewer employs this driver. Own-fleet pages.
 * - "marketplace" — another carrier's driver, reached through match results.
 *                   Document identifiers and the stored files are the
 *                   employing carrier's; only verdicts and expiry dates
 *                   belong in a match result.
 *
 * Driven by scope, NOT by whether a field happens to be present. The
 * projecting endpoints withhold these fields server-side, but until the
 * client switches over the browser still holds full documents — so a presence
 * check would keep rendering them until that day and then change behaviour
 * silently. A scope check is right in both worlds, and the switch becomes a
 * no-op here.
 */
export type ScorecardScope = 'full' | 'marketplace';

/** Visual severity of a section. "pending" (blue) is "unknown", not "bad". */
export type StatusLevel = 'green' | 'yellow' | 'red' | 'pending';

/** Fields withheld in marketplace scope, as the scorecard reads them. */
export const SCORECARD_WITHHELD_FIELDS = [
  'cdlLicense', 'cdlState', 'cdlClass', 'cdlLicenseUrl', 'cdlDocumentUrl',
  'insurerName', 'insurancePolicyNumber', 'insuranceUrl',
  'clearinghouseStatus', 'profileStatus', 'profileComplete',
] as const;

type ExpiryLevel = 'green' | 'yellow' | 'red';

/** Expiry severity for one date. A missing or unparseable date is red. */
export function expiryLevel(dateStr: string | undefined, now: Date = new Date()): ExpiryLevel {
  if (!dateStr) return 'red';
  try {
    const days = differenceInDays(parseISO(dateStr), now);
    if (Number.isNaN(days)) return 'red';
    if (days < 0) return 'red';
    return days <= EXPIRY_WARNING_DAYS ? 'yellow' : 'green';
  } catch {
    return 'red';
  }
}

/**
 * The CDL section's dot.
 *
 * In full scope a green dot requires the number to be on file — reasonable,
 * since a driver record without one is incomplete. In marketplace scope the
 * number is withheld, so requiring it turned every outside driver red. The
 * expiry date carries the signal and is sent either way.
 */
export function cdlSectionLevel(
  driver: Pick<Driver, 'cdlExpiry' | 'cdlLicense'>,
  scope: ScorecardScope,
  now: Date = new Date()
): StatusLevel {
  const expiry = expiryLevel(driver.cdlExpiry, now);
  const hasNumber = scope === 'marketplace' ? true : !!driver.cdlLicense;
  if (expiry === 'green' && hasNumber) return 'green';
  return expiry === 'yellow' ? 'yellow' : 'red';
}

/**
 * The insurance section's dot. Same shape: the insurer name and policy number
 * are withheld, so only the expiry date may count in marketplace scope.
 */
export function insuranceSectionLevel(
  driver: Pick<Driver, 'insuranceExpiry' | 'insurerName' | 'insurancePolicyNumber'>,
  scope: ScorecardScope,
  now: Date = new Date()
): StatusLevel {
  const expiry = expiryLevel(driver.insuranceExpiry, now);
  const hasInfo =
    scope === 'marketplace'
      ? !!driver.insuranceExpiry
      : !!(driver.insurerName || driver.insurancePolicyNumber || driver.insuranceExpiry);
  if (expiry === 'green' && hasInfo) return 'green';
  return expiry === 'yellow' ? 'yellow' : 'red';
}

/**
 * The licence-class section's dot.
 *
 * "pending" rather than "yellow" when the class is withheld: yellow reads as a
 * problem with the driver, and this is a limit on the viewer.
 */
export function licenseClassLevel(
  driver: Pick<Driver, 'cdlClass'>,
  scope: ScorecardScope
): StatusLevel {
  if (scope === 'marketplace') return 'pending';
  return driver.cdlClass ? 'green' : 'yellow';
}

/**
 * The attestations section's dot.
 *
 * Every input — authorizationConsent, profileStatus, profileComplete — is
 * withheld in marketplace scope, so the old false branch ("Pending · awaiting
 * profile submission") asserted something the viewer had no basis for, about a
 * driver who may well have submitted.
 */
export function attestationsLevel(
  driver: Partial<Driver> & { authorizationConsent?: unknown },
  scope: ScorecardScope
): StatusLevel {
  if (scope === 'marketplace') return 'pending';
  const hasAttestation =
    !!driver.authorizationConsent ||
    driver.profileStatus === 'complete' ||
    driver.profileStatus === 'pending_confirmation' ||
    driver.profileComplete === true;
  return hasAttestation ? 'green' : 'yellow';
}

/**
 * The headline banner, when the caller has no authoritative verdict to pass.
 *
 * Prefer passing one: this is a third implementation of the compliance verdict
 * (after compliance.ts and matching.ts) and it is the laxest — it ignores the
 * screening dates entirely, so a driver compliance.ts calls Red can land here
 * as Green. Kept as a fallback so the own-fleet call sites are unaffected.
 */
export function deriveOverallStatus(
  driver: Pick<Driver, 'cdlExpiry' | 'cdlLicense' | 'medicalCardExpiry' | 'insuranceExpiry'>,
  scope: ScorecardScope,
  now: Date = new Date()
): ComplianceStatus {
  let isExpired = false;
  let isWarning = false;
  for (const v of [driver.cdlExpiry, driver.medicalCardExpiry, driver.insuranceExpiry]) {
    if (!v) continue;
    const level = expiryLevel(v, now);
    if (level === 'red') { isExpired = true; break; }
    if (level === 'yellow') isWarning = true;
  }
  // cdlLicense is withheld in marketplace scope, so requiring it there made the
  // headline read "Overall Compliance: Red" for a driver whose paperwork was
  // entirely in order.
  const hasRequiredFields =
    scope === 'marketplace' ? !!driver.cdlExpiry : !!(driver.cdlLicense && driver.cdlExpiry);
  if (!hasRequiredFields || isExpired) return 'Red';
  return isWarning ? 'Yellow' : 'Green';
}
