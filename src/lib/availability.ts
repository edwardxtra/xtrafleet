/**
 * Declared driver availability (DEV-204).
 *
 * THE PROBLEM THIS SOLVES
 *
 * `Driver.availability` is a current-state enum — "Available" / "On-trip" /
 * "Off-duty". Every question worth asking is time-ranged ("is this driver
 * free next Tuesday"), and a current-state flag cannot answer one. Worse,
 * nothing maintains it automatically: the only writes are 'Available' at
 * driver creation and a manual dropdown.
 *
 * THREE STATES, NOT TWO
 *
 * The important design decision here is that "unknown" is distinct from
 * "unavailable". A driver nobody has declared windows for is NOT busy —
 * we simply do not know. Collapsing those two would either hide real
 * capacity or, worse, let a caller report "available" about a driver whose
 * status is a stale flag somebody set months ago.
 *
 * This matters most for the capacity agent (DEV-151): it has to be able to
 * answer "3 drivers match, availability unconfirmed for all 3" rather than
 * either dropping them or claiming they are free.
 */
import type { Driver, AvailabilityWindow } from './data';
import { buildWindow, type DateWindow } from './commitments';

export type AvailabilityVerdict = 'available' | 'unavailable' | 'unknown';

export interface AvailabilityResult {
  verdict: AvailabilityVerdict;
  /** Short phrase for the UI / the agent, e.g. "declared Oct 12-16". */
  detail: string;
  /** The declared window that produced an 'available' verdict, if any. */
  window?: AvailabilityWindow;
}

/** Enum values that are an explicit human statement of "not free". */
const EXPLICIT_UNAVAILABLE: ReadonlyArray<Driver['availability']> = ['On-trip', 'Off-duty'];

/** Does `outer` fully contain `inner`? */
export function windowContains(outer: DateWindow, inner: DateWindow): boolean {
  return outer.start <= inner.start && outer.end >= inner.end;
}

/** Parse a declared window into comparable epoch bounds, or null if unusable. */
export function toDateWindow(w: AvailabilityWindow): DateWindow | null {
  return buildWindow(w.start, w.end);
}

/** Windows that are parseable. Malformed entries are ignored, not fatal. */
export function usableWindows(driver: Driver): AvailabilityWindow[] {
  return (driver.availabilityWindows ?? []).filter((w) => toDateWindow(w) !== null);
}

export function hasDeclaredAvailability(driver: Driver): boolean {
  return usableWindows(driver).length > 0;
}

function formatSpan(w: AvailabilityWindow): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(w.start)}-${fmt(w.end)}`;
}

/**
 * Is this driver available for `requested`?
 *
 * Resolution order:
 *   1. No window asked about -> fall back to the legacy enum. Callers with
 *      no date (e.g. browsing a driver list) get the old behaviour exactly.
 *   2. Declared windows exist -> they are authoritative. A window must fully
 *      CONTAIN the requested span: a driver free Oct 12-16 is not available
 *      for a job running Oct 15-18.
 *   3. No declared windows -> the enum still speaks when it says "not free"
 *      ('On-trip' / 'Off-duty' are deliberate human statements worth
 *      respecting). But a bare 'Available' is UNKNOWN, not available — that
 *      flag is unmaintained and defaults to 'Available' at driver creation,
 *      so treating it as a positive signal is how you end up telling someone
 *      a driver is free when nobody ever checked.
 */
export function resolveAvailability(
  driver: Driver,
  requested?: DateWindow
): AvailabilityResult {
  if (!requested) {
    return driver.availability === 'Available'
      ? { verdict: 'available', detail: 'marked Available' }
      : { verdict: 'unavailable', detail: `marked ${driver.availability || 'no status'}` };
  }

  const declared = usableWindows(driver);
  if (declared.length > 0) {
    const covering = declared.find((w) => {
      const dw = toDateWindow(w);
      return dw !== null && windowContains(dw, requested);
    });
    if (covering) {
      return { verdict: 'available', detail: `declared ${formatSpan(covering)}`, window: covering };
    }
    return {
      verdict: 'unavailable',
      detail: `no declared window covers these dates (has ${declared.map(formatSpan).join(', ')})`,
    };
  }

  if (EXPLICIT_UNAVAILABLE.includes(driver.availability)) {
    return { verdict: 'unavailable', detail: `marked ${driver.availability}` };
  }

  return { verdict: 'unknown', detail: 'no availability declared for these dates' };
}

/**
 * Whether a verdict should keep the driver out of ranked results.
 *
 * Only a definite 'unavailable' excludes. 'unknown' still ranks — hiding a
 * driver because nobody filled in a form would make the product less useful
 * than the phone call it replaces. Surfacing the uncertainty is the caller's
 * job.
 */
export function excludesFromResults(verdict: AvailabilityVerdict): boolean {
  return verdict === 'unavailable';
}

/** Build a manual window, stamped so later TMS/ELD writes are distinguishable. */
export function manualWindow(
  start: string,
  end: string,
  extra: { homeBase?: string; note?: string } = {}
): AvailabilityWindow {
  return {
    start,
    end,
    source: 'manual',
    recordedAt: new Date().toISOString(),
    ...(extra.homeBase ? { homeBase: extra.homeBase } : {}),
    ...(extra.note ? { note: extra.note } : {}),
  };
}
