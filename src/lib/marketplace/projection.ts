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
import type { AvailabilityWindow, Driver } from '@/lib/data';

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
