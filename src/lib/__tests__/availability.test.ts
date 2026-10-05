import { describe, it, expect } from 'vitest';
import {
  resolveAvailability,
  excludesFromResults,
  hasDeclaredAvailability,
  usableWindows,
  windowContains,
  manualWindow,
} from '../availability';
import { buildWindow } from '../commitments';
import { findMatchingDrivers, findIneligibleDrivers } from '../matching';
import type { Driver, Load, AvailabilityWindow } from '../data';

/**
 * Declared availability (DEV-204).
 *
 * The invariant that matters most: UNKNOWN is not UNAVAILABLE. A driver
 * nobody has declared windows for is not busy — we just don't know, and the
 * caller has to be able to say so.
 */

function driver(overrides: Partial<Driver> = {}): Driver {
  return {
    id: 'd1',
    name: 'Dana Reyes',
    location: 'Boston, MA',
    certifications: [],
    availability: 'Available',
    vehicleType: 'Dry Van',
    ...overrides,
  };
}

const win = (start: string, end: string): AvailabilityWindow => ({ start, end, source: 'manual' });

describe('windowContains', () => {
  it('requires full containment, not mere overlap', () => {
    const outer = buildWindow('2026-03-10', '2026-03-20')!;
    expect(windowContains(outer, buildWindow('2026-03-12', '2026-03-14')!)).toBe(true);
    // Overlaps but runs past the end — a driver free to the 20th cannot take
    // a job running to the 25th.
    expect(windowContains(outer, buildWindow('2026-03-18', '2026-03-25')!)).toBe(false);
  });

  it('accepts exact boundaries', () => {
    const outer = buildWindow('2026-03-10', '2026-03-20')!;
    expect(windowContains(outer, buildWindow('2026-03-10', '2026-03-20')!)).toBe(true);
  });
});

describe('resolveAvailability — with declared windows', () => {
  const d = driver({ availabilityWindows: [win('2026-03-10', '2026-03-20')] });

  it('says available when a window covers the dates', () => {
    const r = resolveAvailability(d, buildWindow('2026-03-12', '2026-03-14')!);
    expect(r.verdict).toBe('available');
    expect(r.detail).toContain('declared');
    expect(r.window).toBeDefined();
  });

  it('says unavailable when no window covers the dates', () => {
    const r = resolveAvailability(d, buildWindow('2026-04-01', '2026-04-03')!);
    expect(r.verdict).toBe('unavailable');
    expect(r.detail).toContain('no declared window');
  });

  it('lists the windows it does have, so the reason is actionable', () => {
    const r = resolveAvailability(d, buildWindow('2026-04-01')!);
    expect(r.detail).toContain('Mar 10');
  });

  it('checks every declared window, not just the first', () => {
    const many = driver({
      availabilityWindows: [win('2026-03-10', '2026-03-12'), win('2026-05-01', '2026-05-30')],
    });
    expect(resolveAvailability(many, buildWindow('2026-05-10', '2026-05-12')!).verdict).toBe('available');
  });

  it('lets a declared window override a stale enum', () => {
    // Deliberate: the enum defaults to 'Available' at creation and is only
    // ever changed by hand, so an explicit declaration is the better signal.
    const stale = driver({
      availability: 'On-trip',
      availabilityWindows: [win('2026-03-10', '2026-03-20')],
    });
    expect(resolveAvailability(stale, buildWindow('2026-03-12')!).verdict).toBe('available');
  });

  it('ignores malformed windows rather than throwing', () => {
    const messy = driver({
      availabilityWindows: [
        { start: 'not a date', end: 'also not', source: 'manual' },
        win('2026-03-10', '2026-03-20'),
      ],
    });
    expect(usableWindows(messy)).toHaveLength(1);
    expect(resolveAvailability(messy, buildWindow('2026-03-12')!).verdict).toBe('available');
  });
});

describe('resolveAvailability — without declared windows', () => {
  it('returns UNKNOWN for a driver marked Available — the flag is unmaintained', () => {
    // This is the heart of the ticket. 'Available' is the creation default
    // and nothing updates it automatically, so it is not evidence.
    const r = resolveAvailability(driver(), buildWindow('2026-03-12')!);
    expect(r.verdict).toBe('unknown');
    expect(r.detail).toContain('no availability declared');
  });

  it.each(['On-trip', 'Off-duty'] as const)(
    'still respects an explicit %s — a human said so',
    (status) => {
      const r = resolveAvailability(driver({ availability: status }), buildWindow('2026-03-12')!);
      expect(r.verdict).toBe('unavailable');
    },
  );

  it('falls back to the enum entirely when no dates are being asked about', () => {
    // Browsing a driver list with no load selected: old behaviour, exactly.
    expect(resolveAvailability(driver()).verdict).toBe('available');
    expect(resolveAvailability(driver({ availability: 'Off-duty' })).verdict).toBe('unavailable');
  });
});

describe('excludesFromResults', () => {
  it('excludes only a definite unavailable', () => {
    expect(excludesFromResults('unavailable')).toBe(true);
    expect(excludesFromResults('available')).toBe(false);
  });

  it('does NOT exclude unknown — surfacing beats hiding', () => {
    expect(excludesFromResults('unknown')).toBe(false);
  });
});

describe('hasDeclaredAvailability', () => {
  it('is false for a legacy driver and true once a usable window exists', () => {
    expect(hasDeclaredAvailability(driver())).toBe(false);
    expect(hasDeclaredAvailability(driver({ availabilityWindows: [] }))).toBe(false);
    expect(hasDeclaredAvailability(driver({ availabilityWindows: [win('2026-03-10', '2026-03-12')] }))).toBe(true);
  });
});

describe('manualWindow', () => {
  it('stamps source and time so a later TMS write is distinguishable', () => {
    const w = manualWindow('2026-03-10', '2026-03-12', { homeBase: 'Lakeland, FL' });
    expect(w.source).toBe('manual');
    expect(w.recordedAt).toBeTruthy();
    expect(w.homeBase).toBe('Lakeland, FL');
  });

  it('omits optional keys rather than writing undefined — Firestore rejects them', () => {
    const w = manualWindow('2026-03-10', '2026-03-12');
    expect('homeBase' in w).toBe(false);
    expect('note' in w).toBe(false);
  });
});

describe('matching honours declared availability', () => {
  const load: Load = {
    id: 'load-1',
    origin: 'Boston, MA',
    destination: 'Tampa, FL',
    cargo: 'Dry goods',
    weight: 32000,
    status: 'Pending',
    requiredQualifications: [],
    pickupDate: '2026-03-12',
  };
  const requestedWindow = buildWindow('2026-03-12')!;

  const declaredFree = driver({ id: 'free', availabilityWindows: [win('2026-03-01', '2026-03-31')] });
  const declaredBusy = driver({ id: 'busy', availabilityWindows: [win('2026-05-01', '2026-05-31')] });
  const undeclared = driver({ id: 'unknown' });
  const pool = [declaredFree, declaredBusy, undeclared];

  it('drops a driver whose declared windows do not cover the dates', () => {
    const ranked = findMatchingDrivers(load, pool, { requestedWindow });
    expect(ranked.map((m) => m.driver.id)).not.toContain('busy');
  });

  it('keeps the undeclared driver and marks them unknown rather than hiding them', () => {
    const ranked = findMatchingDrivers(load, pool, { requestedWindow });
    const row = ranked.find((m) => m.driver.id === 'unknown');
    expect(row).toBeDefined();
    expect(row!.availabilityVerdict).toBe('unknown');
  });

  it('marks the declared driver available, with the span as evidence', () => {
    const ranked = findMatchingDrivers(load, pool, { requestedWindow });
    const row = ranked.find((m) => m.driver.id === 'free');
    expect(row!.availabilityVerdict).toBe('available');
    expect(row!.availabilityDetail).toContain('declared');
  });

  it('explains the exclusion in the ineligible panel', () => {
    const out = findIneligibleDrivers(pool, { requestedWindow });
    expect(out.map((o) => o.driver.id)).toEqual(['busy']);
    expect(out[0].reason).toContain('no declared window');
  });

  it('leaves legacy behaviour intact when no window is requested', () => {
    // Every pre-DEV-204 call site passes no requestedWindow and must be
    // filtered purely on the enum, as before.
    const ranked = findMatchingDrivers({ ...load, pickupDate: undefined }, pool, {});
    expect(ranked).toHaveLength(3);
  });
});
