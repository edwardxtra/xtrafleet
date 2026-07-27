import { describe, it, expect } from 'vitest';
import { getCoordinatesSync, calculateMatchScore } from '../matching';
import type { Driver, Load } from '../data';

// Regression coverage for the fallback geocoder. The old implementation used a
// substring scan (`n.includes(key) || key.includes(n)`) that mis-resolved any
// place name containing a short key as a substring — e.g. "Lawrence" / "Atlanta"
// both contain "la", so both resolved to the "la" (Los Angeles) entry, placing a
// nearby driver ~2,600 mi away and collapsing the location score to ~1/40.

describe('getCoordinatesSync', () => {
  it('resolves a plain "City, ST" to the right city', () => {
    expect(getCoordinatesSync('Boston, MA')).toEqual({ lat: 42.3601, lng: -71.0589 });
  });

  it('resolves Lawrence, MA to Lawrence — NOT Los Angeles', () => {
    const c = getCoordinatesSync('Lawrence, MA');
    expect(c).not.toBeNull();
    // East-coast longitude (~-71), not Los Angeles (~-118).
    expect(c!.lng).toBeGreaterThan(-80);
    expect(c!.lat).toBeGreaterThan(40);
  });

  it('does NOT resolve Atlanta, GA to Los Angeles via a "la" substring', () => {
    expect(getCoordinatesSync('Atlanta, GA')).toEqual({ lat: 33.749, lng: -84.388 });
  });

  it('disambiguates same-named cities by state', () => {
    expect(getCoordinatesSync('Springfield, IL')).toEqual({ lat: 39.7817, lng: -89.6501 });
    expect(getCoordinatesSync('Springfield, MA')).toEqual({ lat: 42.1015, lng: -72.5898 });
  });

  it('resolves a street address by its city token', () => {
    expect(getCoordinatesSync('123 Main St, Boston, MA')).toEqual({ lat: 42.3601, lng: -71.0589 });
  });

  it('returns null for an unknown place (no false substring match)', () => {
    expect(getCoordinatesSync('Nowhereville, ZZ')).toBeNull();
  });
});

describe('location scoring regression', () => {
  const driver = {
    id: 'd1',
    name: 'Test Driver',
    location: 'Lawrence, MA',
    certifications: [],
    availability: 'Available',
    vehicleType: 'Dry Van',
  } as Driver;

  const load = {
    id: 'l1',
    origin: 'Boston, MA',
    destination: 'Springfield, MA',
    cargo: 'general-freight',
    weight: 0,
    status: 'live',
    requiredQualifications: [],
  } as unknown as Load;

  it('scores a ~25mi Lawrence -> Boston pairing near the top of the location bucket', () => {
    const breakdown = calculateMatchScore(driver, load);
    // Previously ~1/40 because of the substring bug; now should be near full.
    expect(breakdown.locationScore).toBeGreaterThanOrEqual(30);
  });
});
