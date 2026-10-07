/**
 * What a driver record looks like on the wire for marketplace discovery.
 *
 * The matcher reads about a dozen fields. A driver document carries more than
 * forty, and the thirty-odd it does not need include every sensitive one: CDL
 * number, MVR number, insurance policy number, phone, email, and the storage
 * URLs for the CDL scan, medical card, background check and drug-and-alcohol
 * screening. Those URLs carry Firebase download tokens, so they resolve for
 * anyone holding them regardless of storage.rules.
 *
 * So the field list the matcher needs is almost exactly the field list that is
 * safe to send. This module is where that overlap is written down once.
 *
 * Note: src/ai/tools/owner-tools.ts projects more narrowly still for the AI
 * agent — it withholds compliance dates and returns a derived status instead,
 * because a model does not need the dates to phrase an answer. Deliberately a
 * different shape, not a duplicate of this one.
 */
import type { AvailabilityWindow, Driver, Load, Match } from '@/lib/data';
import { commitmentsFromMatches, type DriverCommitment } from '@/lib/commitments';

/** Exactly the fields the deterministic matcher reads. */
export interface MarketplaceDriver {
  id: string;
  ownerId: string;
  name: string;
  location: string;
  availability: Driver['availability'];
  availabilityWindows?: AvailabilityWindow[];
  vehicleType: Driver['vehicleType'];
  vehicleTypes?: string[];
  trailerTypes?: Driver['trailerTypes'];
  certifications: string[];
  rating?: number;
  // Expiry dates feed the deterministic compliance score. Dates only — never
  // the identifiers or the documents they came from.
  cdlExpiry?: string;
  medicalCardExpiry?: string;
  insuranceExpiry?: string;
}

/**
 * Fields that must never leave the server for a driver the caller does not
 * employ. Asserted in the tests rather than trusted to review.
 */
export const WITHHELD_DRIVER_FIELDS = [
  'cdlLicense', 'cdlLicenseUrl', 'cdlDocumentUrl', 'cdlState', 'cdlClass',
  'motorVehicleRecordNumber', 'mvrUrl',
  'medicalCardUrl', 'insuranceUrl', 'insurerName', 'insurancePolicyNumber',
  'backgroundCheckUrl', 'backgroundCheckDate',
  'preEmploymentScreeningUrl', 'preEmploymentScreeningDate',
  'drugAndAlcoholScreeningUrl', 'drugAndAlcoholScreeningDate',
  'email', 'phone', 'phoneNumber',
  'reviews', 'profileSummary',
] as const;

/**
 * Narrow a raw driver document to what discovery needs.
 *
 * Builds the result by naming each field rather than deleting unwanted ones,
 * so a field added to Driver later is withheld by default. A blocklist would
 * leak it.
 */
export function projectDriver(
  raw: Partial<Driver>,
  id: string,
  ownerId: string
): MarketplaceDriver {
  return {
    id,
    ownerId,
    name: raw.name || 'Unnamed driver',
    location: raw.location || '',
    availability: raw.availability ?? 'Available',
    ...(raw.availabilityWindows ? { availabilityWindows: raw.availabilityWindows } : {}),
    vehicleType: raw.vehicleType ?? 'Dry Van',
    ...(raw.vehicleTypes ? { vehicleTypes: raw.vehicleTypes } : {}),
    ...(raw.trailerTypes ? { trailerTypes: raw.trailerTypes } : {}),
    certifications: raw.certifications ?? [],
    ...(typeof raw.rating === 'number' ? { rating: raw.rating } : {}),
    ...(raw.cdlExpiry ? { cdlExpiry: raw.cdlExpiry } : {}),
    ...(raw.medicalCardExpiry ? { medicalCardExpiry: raw.medicalCardExpiry } : {}),
    ...(raw.insuranceExpiry ? { insuranceExpiry: raw.insuranceExpiry } : {}),
  };
}

/**
 * Pre-activated drivers (DEV-158) are not marketplace-visible.
 *
 * Filtered in application code rather than in the query, because legacy
 * drivers carry no accountStatus field at all and a Firestore query cannot
 * match a missing field — filtering there would silently drop every driver
 * predating the field. Absent means active.
 */
export function isMarketplaceVisible(raw: Partial<Driver>): boolean {
  if (raw.isActive === false) return false;
  return (raw.accountStatus ?? 'active') !== 'pre-activated';
}

// ---------------------------------------------------------------------------
// Loads
// ---------------------------------------------------------------------------

/**
 * Load statuses that are on the board — matchable by someone else's driver.
 *
 * "Pending" is the legacy string; the current /api/loads POST writes "live"
 * and bumps to "match_pending" once a match request goes out. All three are
 * available.
 *
 * Exported because three places need to agree on this set: this projection,
 * findMatchingLoads, and the dashboard panel. When they drifted, the panel
 * showed loads the matcher would not score.
 */
export const MARKETPLACE_LOAD_STATUSES: readonly Load['status'][] = [
  'Pending',
  'live',
  'match_pending',
];

/** Exactly the fields the matcher scores and the board renders. */
export interface MarketplaceLoad {
  id: string;
  ownerId: string;
  origin: string;
  destination: string;
  cargo: string;
  weight: number;
  status: Load['status'];
  requiredQualifications: string[];
  trailerType?: Load['trailerType'];
  description?: string;
  /** The posted rate. On a load board this is the offer — it is the point. */
  price?: number;
  pickupDate?: string;
  route?: Load['route'];
}

/**
 * Fields withheld from a load the caller does not own.
 *
 * Only `externalRefs` is a genuine disclosure: it carries the internal
 * connection id and a deep link into the poster's TMS, which names their
 * broker and their order number. The node and corridor ids are withheld
 * because nothing client-side reads them, not because they are secret —
 * but the test asserts the whole list, so adding one here is how a field
 * stops being sent.
 */
export const WITHHELD_LOAD_FIELDS = [
  'externalRefs',
  'originNodeId',
  'destinationNodeId',
  'corridorId',
] as const;

/**
 * Narrow a raw load document to what the board and the matcher need.
 *
 * Same discipline as projectDriver: names the fields it keeps, so a field
 * added to Load later is withheld until someone decides to send it.
 */
export function projectLoad(
  raw: Partial<Load>,
  id: string,
  ownerId: string
): MarketplaceLoad {
  return {
    id,
    ownerId,
    origin: raw.origin || '',
    destination: raw.destination || '',
    cargo: raw.cargo || '',
    weight: typeof raw.weight === 'number' ? raw.weight : 0,
    status: raw.status ?? 'Pending',
    requiredQualifications: raw.requiredQualifications ?? [],
    ...(raw.trailerType ? { trailerType: raw.trailerType } : {}),
    ...(raw.description ? { description: raw.description } : {}),
    ...(typeof raw.price === 'number' ? { price: raw.price } : {}),
    ...(raw.pickupDate ? { pickupDate: raw.pickupDate } : {}),
    ...(raw.route ? { route: raw.route } : {}),
  };
}

/**
 * Is this load on the board?
 *
 * A document with no status is NOT on the board. Defaulting it to 'Pending'
 * would be the wrong direction: an unknown status would start getting matched.
 */
export function isLoadAvailable(raw: Partial<Load>): boolean {
  return raw.status !== undefined && MARKETPLACE_LOAD_STATUSES.includes(raw.status);
}

// ---------------------------------------------------------------------------
// Commitments
// ---------------------------------------------------------------------------

/**
 * Fields withheld from the commitment feed.
 *
 * `matches` is readable by any signed-in account today, because the matcher
 * needs other carriers' commitments to know which drivers are already spoken
 * for. The cost is that it also hands over the negotiation: the asking rate,
 * the countered rate, the settled price, the decline reason, and the score we
 * gave the pairing.
 *
 * None of that is needed to answer "is this driver free on the 12th". A
 * commitment is a driver id and a date window. That is all this returns.
 */
export const WITHHELD_MATCH_FIELDS = [
  'originalTerms', 'counterTerms', 'rate', 'price',
  'loadSnapshot', 'driverSnapshot', 'declineReason', 'matchScore',
  'loadOwnerId', 'driverOwnerId', 'recipientOwnerId', 'initiatedBy',
  'complianceWarning', 'tlaId',
] as const;

/**
 * Turn raw committing matches into commitments, with the lane withheld for
 * drivers the caller does not employ.
 *
 * `describeConflict` renders the label as "(Boston, MA to Tampa, FL)" so the
 * user can see WHY their driver is unavailable. For their own driver that is
 * useful. For someone else's it is a third carrier's lane, which answers a
 * question nobody asked — the conflict check only needs the window. So the
 * label goes out only to the employer, and describeConflict already degrades
 * cleanly to "Already committed on Mar 12 — accepted match" without it.
 */
export function projectCommitments(
  matches: Match[],
  callerId: string
): DriverCommitment[] {
  const employerOf = new Map<string, string | undefined>(
    matches.map((m) => [m.id, m.driverOwnerId])
  );
  return commitmentsFromMatches(matches).map((c) =>
    employerOf.get(c.id) === callerId ? c : { ...c, label: undefined }
  );
}
