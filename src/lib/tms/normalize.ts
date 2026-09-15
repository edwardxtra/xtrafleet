/**
 * Normalization + provenance (DEV-155).
 *
 * Turning an external record into an XtraFleet record is where integrations
 * usually rot: every provider spells "dry van" differently, dates arrive in
 * three formats, and "who last wrote this field" gets lost. This module
 * keeps all of that in one pure, testable place — no Firestore, no network.
 *
 * The rule the rest of the codebase depends on: a normalized record is
 * always a *draft*. Nothing here writes, and nothing here invents an owner,
 * a price, or a status we didn't receive.
 */

import type { Load } from '@/lib/data';
import { TRAILER_TYPES, type TrailerType } from '@/lib/trailer-types';
import { LOAD_TYPES } from '@/lib/load-types';
import { resolveAddressToNode, resolveCorridor } from '@/lib/nodes';
import type {
  DriverAvailability,
  ExternalLoad,
  ExternalRef,
  FieldOwner,
  SyncPolicy,
  TmsProviderId,
} from './types';
import { DEFAULT_SYNC_POLICY } from './types';

// ---------------------------------------------------------------------------
// External refs
// ---------------------------------------------------------------------------

/**
 * Insert or replace a ref, keyed by (provider, connectionId). A record can
 * hold refs from several systems; it must never hold two from the same
 * connection.
 */
export function mergeExternalRef(
  existing: ExternalRef[] | undefined,
  incoming: ExternalRef
): ExternalRef[] {
  const rest = (existing ?? []).filter(
    (r) => !(r.provider === incoming.provider && r.connectionId === incoming.connectionId)
  );
  return [...rest, incoming];
}

export function findExternalRef(
  refs: ExternalRef[] | undefined,
  provider: TmsProviderId,
  connectionId?: string
): ExternalRef | undefined {
  return (refs ?? []).find(
    (r) => r.provider === provider && (!connectionId || r.connectionId === connectionId)
  );
}

/**
 * Drop a delivery we've already superseded.
 *
 * Webhooks arrive out of order — a retried "load.updated" from 10:00 can
 * land after the 10:05 one. When the provider gives us a monotonic version
 * we compare it; when it doesn't, we fall back to the timestamp; when we
 * have neither, we accept (and log loudly at the call site), because
 * refusing everything unversioned would mean processing nothing.
 */
export function isStaleUpdate(
  current: ExternalRef | undefined,
  incoming: { externalVersion?: string; syncedAt?: string }
): boolean {
  if (!current) return false;

  if (current.externalVersion && incoming.externalVersion) {
    const a = Number(current.externalVersion);
    const b = Number(incoming.externalVersion);
    if (Number.isFinite(a) && Number.isFinite(b)) return b < a;
    // Non-numeric versions (etags) are only comparable for equality; an
    // identical etag means we already have this exact state.
    return incoming.externalVersion === current.externalVersion;
  }

  if (current.syncedAt && incoming.syncedAt) {
    return new Date(incoming.syncedAt).getTime() < new Date(current.syncedAt).getTime();
  }

  return false;
}

// ---------------------------------------------------------------------------
// Field ownership
// ---------------------------------------------------------------------------

export function fieldOwner(field: string, policy: SyncPolicy = DEFAULT_SYNC_POLICY): FieldOwner {
  if (policy.xtrafleetOwnedFields?.includes(field)) return 'xtrafleet';
  if (policy.tmsOwnedFields?.includes(field)) return 'tms';
  return policy.defaultOwner;
}

/**
 * Apply an inbound patch, honouring ownership.
 *
 * Returns both the merged record and the fields that were *rejected*, so the
 * caller can surface "your TMS wants to change the rate to $900" as a
 * reviewable conflict instead of silently dropping it. Silent drops are how
 * integrations lose people's trust.
 */
export function applyOwnedFields<T extends Record<string, unknown>>(
  current: T,
  patch: Partial<T>,
  policy: SyncPolicy = DEFAULT_SYNC_POLICY
): { merged: T; applied: string[]; rejected: string[] } {
  const merged = { ...current };
  const applied: string[] = [];
  const rejected: string[] = [];

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (fieldOwner(key, policy) === 'tms') {
      (merged as Record<string, unknown>)[key] = value;
      applied.push(key);
    } else {
      rejected.push(key);
    }
  }

  return { merged, applied, rejected };
}

// ---------------------------------------------------------------------------
// Value mapping
// ---------------------------------------------------------------------------

const TRAILER_ALIASES: Record<string, TrailerType> = {
  'dry van': 'dry-van',
  van: 'dry-van',
  dv: 'dry-van',
  reefer: 'reefer',
  refrigerated: 'reefer',
  r: 'reefer',
  flatbed: 'flatbed',
  flat: 'flatbed',
  fb: 'flatbed',
  'step deck': 'step-deck',
  stepdeck: 'step-deck',
  'drop deck': 'step-deck',
  tanker: 'tanker',
  tank: 'tanker',
};

/** Best-effort map of a provider's equipment string onto our TrailerType. */
export function normalizeTrailerType(input?: string): TrailerType | undefined {
  if (!input) return undefined;
  const key = input.trim().toLowerCase();

  const exact = TRAILER_TYPES.find(
    (t) => t.value === key || t.label.toLowerCase() === key
  );
  if (exact) return exact.value;

  return TRAILER_ALIASES[key] ?? TRAILER_ALIASES[key.replace(/[-_]/g, ' ')];
}

/** Map a provider's commodity string onto a LOAD_TYPES value. */
export function normalizeLoadType(input?: string): string | undefined {
  if (!input) return undefined;
  const key = input.trim().toLowerCase();
  const hit = LOAD_TYPES.find(
    (t) => t.value === key || t.label.toLowerCase() === key
  );
  return hit?.value;
}

/**
 * Provider status vocabularies are wildly inconsistent, and guessing wrong
 * here means a load silently going live (or silently disappearing). Only
 * map what we recognize; everything else stays `undefined` and the caller
 * keeps the load as a draft for a human to look at.
 */
const LOAD_STATUS_MAP: Record<string, Load['status']> = {
  available: 'Pending',
  open: 'Pending',
  planned: 'Pending',
  tendered: 'Pending',
  assigned: 'Matched',
  dispatched: 'Matched',
  covered: 'Matched',
  in_transit: 'In-transit',
  'in transit': 'In-transit',
  picked_up: 'In-transit',
  delivered: 'Delivered',
  completed: 'Delivered',
};

export function normalizeLoadStatus(input?: string): Load['status'] | undefined {
  if (!input) return undefined;
  return LOAD_STATUS_MAP[input.trim().toLowerCase().replace(/-/g, '_')];
}

/** Parse a provider date defensively — an invalid date must not become NaN. */
export function normalizeIsoDate(input?: string): string | undefined {
  if (!input) return undefined;
  const ts = Date.parse(input);
  return Number.isNaN(ts) ? undefined : new Date(ts).toISOString();
}

// ---------------------------------------------------------------------------
// External load → draft XtraFleet load
// ---------------------------------------------------------------------------

export interface NormalizedLoadDraft {
  /** Safe to merge into a `loads` document. Never contains an id or ownerId. */
  draft: Partial<Load> & {
    externalRefs: ExternalRef[];
    originNodeId?: string;
    destinationNodeId?: string;
    corridorId?: string;
  };
  /**
   * Fields the provider sent that we could not map. Non-empty means a human
   * should review before the load goes live — this is the difference
   * between "imported" and "imported correctly".
   */
  unmapped: string[];
}

export function normalizeExternalLoad(
  external: ExternalLoad,
  ref: Omit<ExternalRef, 'externalId' | 'externalVersion'>
): NormalizedLoadDraft {
  const unmapped: string[] = [];

  const trailerType = normalizeTrailerType(external.trailerType);
  if (external.trailerType && !trailerType) unmapped.push('trailerType');

  const loadType = normalizeLoadType(external.loadType);
  if (external.loadType && !loadType) unmapped.push('loadType');

  const status = normalizeLoadStatus(external.status);
  if (external.status && !status) unmapped.push('status');

  const pickupDate = normalizeIsoDate(external.pickupDate);
  if (external.pickupDate && !pickupDate) unmapped.push('pickupDate');

  // Node resolution is text-only here; the geocoder in the loads route can
  // re-resolve with coordinates later for a tighter match.
  const originNode = resolveAddressToNode({ address: external.origin });
  const destinationNode = resolveAddressToNode({ address: external.destination });
  const corridor =
    originNode && destinationNode
      ? resolveCorridor(originNode.node.id, destinationNode.node.id)
      : null;

  return {
    draft: {
      origin: external.origin,
      destination: external.destination,
      cargo: external.cargo ?? loadType ?? 'General Freight',
      weight: external.weightLbs ?? 0,
      // A load we couldn't fully map must not go live on its own.
      status: status ?? 'Pending',
      requiredQualifications: [],
      ...(trailerType ? { trailerType } : {}),
      ...(pickupDate ? { pickupDate } : {}),
      // Deliberately NOT copying `external.rate` into `price`: a TMS rate is
      // usually the broker's linehaul, not driver pay. Mapping it needs a
      // per-customer decision, so it stays out until someone makes one.
      externalRefs: [
        {
          ...ref,
          externalId: external.externalId,
          externalVersion: external.externalVersion,
        },
      ],
      ...(originNode ? { originNodeId: originNode.node.id } : {}),
      ...(destinationNode ? { destinationNodeId: destinationNode.node.id } : {}),
      ...(corridor ? { corridorId: corridor.id } : {}),
    },
    unmapped,
  };
}

// ---------------------------------------------------------------------------
// Availability → DEV-155 "TMS Confidence Score"
// ---------------------------------------------------------------------------

/** Base confidence by how the observation reached us. */
const SOURCE_CONFIDENCE: Record<DriverAvailability['source'], number> = {
  tms: 100,
  eld: 90,
  inferred: 70,
  manual: 60, // DEV-155: "Real-time integration = 100, manual entry = 60"
};

/**
 * 0–100 confidence in an availability record, for the DEV-155 scoring
 * formula's W6 term.
 *
 * Source sets the ceiling; staleness decays it. A TMS reading from six hours
 * ago is not worth more than a dispatcher who typed something in ten minutes
 * ago, and pretending otherwise is how a "high confidence" match turns into
 * a driver who is already 200 miles away.
 */
export function tmsConfidenceScore(
  availability: DriverAvailability,
  now: Date = new Date()
): number {
  const base = SOURCE_CONFIDENCE[availability.source] ?? 50;

  const observed = Date.parse(availability.observedAt);
  if (Number.isNaN(observed)) return Math.round(base * 0.5);

  const ageHours = Math.max(0, (now.getTime() - observed) / 3_600_000);

  // Full credit for an hour, then linear decay to a 25% floor at 12 hours.
  let freshness = 1;
  if (ageHours > 1) {
    freshness = Math.max(0.25, 1 - (ageHours - 1) / 12);
  }

  return Math.round(base * freshness);
}

/**
 * Which of several availability records to believe. Highest confidence wins;
 * ties break toward the more recent observation.
 */
export function pickBestAvailability(
  records: DriverAvailability[],
  now: Date = new Date()
): DriverAvailability | undefined {
  return records.reduce<DriverAvailability | undefined>((best, candidate) => {
    if (!best) return candidate;
    const bestScore = tmsConfidenceScore(best, now);
    const candidateScore = tmsConfidenceScore(candidate, now);
    if (candidateScore !== bestScore) return candidateScore > bestScore ? candidate : best;
    return Date.parse(candidate.observedAt) > Date.parse(best.observedAt) ? candidate : best;
  }, undefined);
}
