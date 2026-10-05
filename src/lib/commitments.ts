/**
 * Driver commitment conflicts (DEV-203).
 *
 * WHY THIS EXISTS
 *
 * `matching.ts` had exactly two hard filters: the `availability` enum and
 * expired documents. Neither knows whether a driver is already spoken for.
 *
 * And the enum is not maintained automatically — nothing in the codebase
 * sets `'On-trip'` when a match forms, a TLA is signed, or a trip starts.
 * The only writes are `'Available'` at driver creation and the manual
 * dropdown in edit-driver-modal. So a driver mid-trip under a signed TLA
 * still ranked as Available unless somebody remembered to change a field.
 *
 * This module answers one question: given a driver's existing commitments
 * and a window somebody is asking about, is there an overlap?
 *
 * DELIBERATELY PURE
 *
 * No Firestore. Callers fetch commitments and pass them in, the same way
 * `findMatchingDrivers` takes a driver array. Keeps the overlap logic unit
 * testable and keeps matching.ts free of data-layer dependencies.
 */
import type { Match, TLA, MatchStatus } from './data';

/** Match states where the driver is spoken for. */
export const COMMITTED_MATCH_STATUSES: readonly MatchStatus[] = [
  'accepted',
  'tla_pending',
  'tla_signed',
  'in_progress',
];

/** TLA states where the driver is spoken for. */
export const COMMITTED_TLA_STATUSES: readonly TLA['status'][] = [
  'pending_lessee',
  'signed',
  'in_progress',
];

/**
 * How long a commitment blocks a driver when only a pickup date is known.
 *
 * Matches carry a pickup date but no end date, so the trip length is a
 * guess. Two days covers pickup plus a typical regional run. Too short and
 * we double-book; too long and we hide capacity that is genuinely free.
 * Named so it can be tuned once real trip durations exist to measure.
 */
export const DEFAULT_COMMITMENT_DAYS = 2;

export interface DateWindow {
  /** Inclusive start, epoch ms. */
  start: number;
  /** Inclusive end, epoch ms. */
  end: number;
}

export interface DriverCommitment {
  driverId: string;
  kind: 'match' | 'tla';
  /** Match or TLA id, so the UI can link to the conflicting trip. */
  id: string;
  window: DateWindow;
  /** Human-readable, e.g. "Boston, MA -> Tampa, FL". */
  label?: string;
}

/** Parse a date-ish string to epoch ms at the START of that day, or null. */
function startOfDayMs(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value);
  const ms = parsed.getTime();
  if (!Number.isFinite(ms)) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime();
}

/** End of the day containing `ms`. */
function endOfDayMs(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
}

function addDays(ms: number, days: number): number {
  return ms + days * 86_400_000;
}

/**
 * Build a window from a start date and an optional end date. When the end
 * is missing or not after the start, fall back to DEFAULT_COMMITMENT_DAYS.
 */
export function buildWindow(start: string | undefined, end?: string): DateWindow | null {
  const startMs = startOfDayMs(start);
  if (startMs === null) return null;

  const endMs = startOfDayMs(end);
  if (endMs !== null && endMs >= startMs) {
    return { start: startMs, end: endOfDayMs(endMs) };
  }
  return { start: startMs, end: endOfDayMs(addDays(startMs, DEFAULT_COMMITMENT_DAYS - 1)) };
}

/**
 * The window a match ties the driver up for.
 *
 * Counter terms win when present — that is the pickup date the parties
 * actually settled on, the same precedence generateTLA uses.
 */
export function matchCommitmentWindow(match: Match): DateWindow | null {
  const terms = match.counterTerms || match.originalTerms;
  return buildWindow(terms?.pickupDate, terms?.deliveryDate);
}

/** The window a TLA ties the driver up for. */
export function tlaCommitmentWindow(tla: TLA): DateWindow | null {
  return buildWindow(tla.trip?.startDate, tla.trip?.endDate);
}

/** Does this match currently hold the driver? */
export function isCommittingMatch(match: Pick<Match, 'status'>): boolean {
  return COMMITTED_MATCH_STATUSES.includes(match.status);
}

/** Does this TLA currently hold the driver? */
export function isCommittingTla(tla: Pick<TLA, 'status'>): boolean {
  return COMMITTED_TLA_STATUSES.includes(tla.status);
}

/** Turn matches into commitments, dropping any that don't hold the driver. */
export function commitmentsFromMatches(matches: Match[]): DriverCommitment[] {
  const out: DriverCommitment[] = [];
  for (const match of matches) {
    if (!isCommittingMatch(match)) continue;
    const window = matchCommitmentWindow(match);
    if (!window) continue; // no usable date — cannot claim a conflict
    out.push({
      driverId: match.driverId,
      kind: 'match',
      id: match.id,
      window,
      label: match.loadSnapshot
        ? `${match.loadSnapshot.origin} to ${match.loadSnapshot.destination}`
        : undefined,
    });
  }
  return out;
}

/** Turn TLAs into commitments, dropping any that don't hold the driver. */
export function commitmentsFromTlas(tlas: TLA[]): DriverCommitment[] {
  const out: DriverCommitment[] = [];
  for (const tla of tlas) {
    if (!isCommittingTla(tla)) continue;
    const window = tlaCommitmentWindow(tla);
    if (!window) continue;
    out.push({
      driverId: tla.driver?.id,
      kind: 'tla',
      id: tla.id,
      window,
      label: tla.trip ? `${tla.trip.origin} to ${tla.trip.destination}` : undefined,
    });
  }
  return out.filter((c) => !!c.driverId);
}

/** Inclusive overlap on both ends — a same-day pickup is a conflict. */
export function windowsOverlap(a: DateWindow, b: DateWindow): boolean {
  return a.start <= b.end && b.start <= a.end;
}

/**
 * Group commitments by driver, so the matcher can look up a driver in O(1)
 * rather than scanning the whole list per candidate.
 */
export function indexCommitmentsByDriver(
  commitments: DriverCommitment[]
): Record<string, DriverCommitment[]> {
  const index: Record<string, DriverCommitment[]> = {};
  for (const c of commitments) {
    (index[c.driverId] ||= []).push(c);
  }
  return index;
}

/**
 * The first commitment overlapping `requested`, or null when the driver is
 * free. Returns the commitment itself so callers can name the clash.
 */
export function findConflict(
  commitments: DriverCommitment[] | undefined,
  requested: DateWindow
): DriverCommitment | null {
  if (!commitments?.length) return null;
  return commitments.find((c) => windowsOverlap(c.window, requested)) ?? null;
}

/** Phrase a conflict for the ineligible-drivers panel. */
export function describeConflict(conflict: DriverCommitment): string {
  const when = new Date(conflict.window.start).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const what = conflict.label ? ` (${conflict.label})` : '';
  const kind = conflict.kind === 'tla' ? 'signed agreement' : 'accepted match';
  return `Already committed on ${when}${what} — ${kind}`;
}
