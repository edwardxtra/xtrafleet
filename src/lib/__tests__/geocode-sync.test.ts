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

// --- The state-centroid bug (Oct 2026) -------------------------------------
//
// Step 3 of getCoordinatesSync scanned every comma-part for a city match,
// including the trailing STATE token. So any city the table did not know fell
// through to its state's centroid and was then treated as a precise location.
//
// Florida's centroid is (28, -82), which sits beside Lakeland. The effect in
// the launch corridor: Lakeland, Plant City and Winter Haven were all unlisted,
// so all three — and most of the rest of Florida — resolved to that one point
// and measured 0 miles from one another. A driver 440 miles away in Pensacola
// earned the maximum 35/35 location score against a Lakeland load, on a
// dimension worth 40 of roughly 100 total points.

describe('state centroids never stand in for a city', () => {
  it('Lakeland and Plant City are distinct places, not the same point', () => {
    const lakeland = getCoordinatesSync('Lakeland, FL');
    const plantCity = getCoordinatesSync('Plant City, FL');
    expect(lakeland).not.toBeNull();
    expect(plantCity).not.toBeNull();
    expect(lakeland).not.toEqual(plantCity);
  });

  it('neither resolves to the Florida centroid', () => {
    const centroid = { lat: 28.0, lng: -82.0 };
    expect(getCoordinatesSync('Lakeland, FL')).not.toEqual(centroid);
    expect(getCoordinatesSync('Plant City, FL')).not.toEqual(centroid);
    expect(getCoordinatesSync('Winter Haven, FL')).not.toEqual(centroid);
  });

  it('an unlisted city returns null rather than its state centroid', () => {
    // Unknown must stay unknown. A centroid here is a confident wrong answer,
    // and the scorer reads it as perfect proximity.
    expect(getCoordinatesSync('Immokalee, FL')).toBeNull();
    expect(getCoordinatesSync('Yeehaw Junction, FL')).toBeNull();
  });

  it('a bare state still resolves — that input really does mean the state', () => {
    expect(getCoordinatesSync('FL')).toEqual({ lat: 28.0, lng: -82.0 });
    expect(getCoordinatesSync('Florida')).toEqual({ lat: 28.0, lng: -82.0 });
  });
});

describe('launch-corridor scoring', () => {
  function driverAt(location: string): Driver {
    return {
      id: 'd1',
      name: 'Test Driver',
      location,
      certifications: [],
      availability: 'Available',
      vehicleType: 'Dry Van',
    } as Driver;
  }

  const lakelandLoad = {
    id: 'l1',
    origin: 'Lakeland, FL',
    destination: 'Orlando, FL',
    cargo: 'general-freight',
    weight: 0,
    status: 'live',
    requiredQualifications: [],
  } as unknown as Load;

  it('a Plant City driver scores top-bucket against a Lakeland load', () => {
    // ~10 miles apart. This is the pairing the pilot actually runs.
    expect(calculateMatchScore(driverAt('Plant City, FL'), lakelandLoad).locationScore).toBe(35);
  });

  it('a Pensacola driver does NOT score as local to Lakeland', () => {
    // The headline symptom: 440 miles by road, previously 35/35.
    const score = calculateMatchScore(driverAt('Pensacola, FL'), lakelandLoad).locationScore;
    expect(score).toBeLessThan(25);
  });

  it('ranks corridor drivers above distant ones', () => {
    // The property that matters: whatever the absolute numbers, near must beat far.
    const plantCity = calculateMatchScore(driverAt('Plant City, FL'), lakelandLoad).locationScore;
    const ocala = calculateMatchScore(driverAt('Ocala, FL'), lakelandLoad).locationScore;
    const pensacola = calculateMatchScore(driverAt('Pensacola, FL'), lakelandLoad).locationScore;
    expect(plantCity).toBeGreaterThan(ocala);
    expect(ocala).toBeGreaterThan(pensacola);
  });

  it('an unknown location scores neutral — not local, not disqualified', () => {
    const unknown = calculateMatchScore(driverAt('Immokalee, FL'), lakelandLoad).locationScore;
    expect(unknown).toBe(10);
    expect(unknown).toBeLessThan(
      calculateMatchScore(driverAt('Plant City, FL'), lakelandLoad).locationScore
    );
  });
});
