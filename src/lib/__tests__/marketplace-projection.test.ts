import { describe, it, expect } from 'vitest';
import {
  projectDriver,
  isMarketplaceVisible,
  WITHHELD_DRIVER_FIELDS,
} from '@/lib/marketplace/projection';
import type { Driver } from '@/lib/data';

/**
 * The projection is the privacy boundary AND the payload fix in one. These
 * tests pin both halves: that nothing sensitive crosses it, and that
 * everything the matcher reads does.
 *
 * A review can miss a field. A test cannot.
 */

/** A driver carrying every field a real record would, sensitive ones included. */
function fullDriver(): Driver {
  return {
    id: 'd1',
    name: 'Dana Reyes',
    location: 'Plant City, FL',
    availability: 'Available',
    availabilityWindows: [
      { start: '2026-11-01', end: '2026-11-07', source: 'manual' },
    ],
    vehicleType: 'Dry Van',
    vehicleTypes: ['Dry Van', 'Reefer'],
    trailerTypes: ['dry-van'],
    certifications: ['hazmat'],
    rating: 4.6,
    isActive: true,
    ownerId: 'owner-1',
    cdlExpiry: '2027-01-01',
    medicalCardExpiry: '2027-02-01',
    insuranceExpiry: '2027-03-01',
    // Everything below must never reach another carrier.
    cdlLicense: 'S1234567',
    cdlState: 'FL',
    cdlClass: 'A',
    cdlLicenseUrl: 'https://example.test/cdl.pdf',
    cdlDocumentUrl: 'https://example.test/cdl-doc.pdf',
    motorVehicleRecordNumber: 'MVR-9988',
    mvrUrl: 'https://example.test/mvr.pdf',
    medicalCardUrl: 'https://example.test/med.pdf',
    insuranceUrl: 'https://example.test/ins.pdf',
    insurerName: 'Acme Mutual',
    insurancePolicyNumber: 'POL-55512',
    backgroundCheckUrl: 'https://example.test/bg.pdf',
    backgroundCheckDate: '2026-01-01',
    preEmploymentScreeningUrl: 'https://example.test/psp.pdf',
    preEmploymentScreeningDate: '2026-01-02',
    drugAndAlcoholScreeningUrl: 'https://example.test/da.pdf',
    drugAndAlcoholScreeningDate: '2026-01-03',
    email: 'dana@example.test',
    phone: '8135550100',
    phoneNumber: '8135550101',
    profileSummary: 'Ten years on the I-4 corridor.',
  } as Driver;
}

describe('projectDriver — nothing sensitive crosses the boundary', () => {
  it('withholds every field on the blocklist', () => {
    const out = projectDriver(fullDriver(), 'd1', 'owner-1') as unknown as Record<string, unknown>;
    const leaked = WITHHELD_DRIVER_FIELDS.filter((f) => f in out);
    expect(leaked, `leaked: ${leaked.join(', ')}`).toEqual([]);
  });

  it('withholds the document URLs specifically', () => {
    // These carry Firebase download tokens, so the URL IS the document.
    const json = JSON.stringify(projectDriver(fullDriver(), 'd1', 'owner-1'));
    expect(json).not.toContain('example.test');
    expect(json).not.toContain('.pdf');
  });

  it('withholds the identifiers', () => {
    const json = JSON.stringify(projectDriver(fullDriver(), 'd1', 'owner-1'));
    expect(json).not.toContain('S1234567');   // CDL number
    expect(json).not.toContain('MVR-9988');   // MVR number
    expect(json).not.toContain('POL-55512');  // policy number
    expect(json).not.toContain('dana@example.test');
    expect(json).not.toContain('8135550100');
  });

  it('withholds a sensitive field added to Driver later', () => {
    // The projection names what it keeps rather than deleting what it drops,
    // so an unknown field is withheld by default. A blocklist would leak it.
    const withNewField = { ...fullDriver(), someNewSecret: 'leak-me' } as unknown as Driver;
    const json = JSON.stringify(projectDriver(withNewField, 'd1', 'owner-1'));
    expect(json).not.toContain('leak-me');
  });
});

describe('projectDriver — everything the matcher reads survives', () => {
  it('keeps the fields the scorer actually uses', () => {
    const out = projectDriver(fullDriver(), 'd1', 'owner-1');
    expect(out).toMatchObject({
      id: 'd1',
      ownerId: 'owner-1',
      name: 'Dana Reyes',
      location: 'Plant City, FL',
      availability: 'Available',
      vehicleType: 'Dry Van',
      certifications: ['hazmat'],
      rating: 4.6,
      cdlExpiry: '2027-01-01',
      medicalCardExpiry: '2027-02-01',
      insuranceExpiry: '2027-03-01',
    });
    expect(out.trailerTypes).toEqual(['dry-van']);
    expect(out.availabilityWindows).toHaveLength(1);
  });

  it('omits absent optional fields rather than writing undefined', () => {
    // Firestore rejects undefined, and an explicit undefined would also widen
    // the payload for no reason.
    const sparse = { name: 'Sparse', location: 'Tampa, FL' } as Driver;
    const out = projectDriver(sparse, 'd2', 'owner-2') as unknown as Record<string, unknown>;
    expect('rating' in out).toBe(false);
    expect('cdlExpiry' in out).toBe(false);
    expect('trailerTypes' in out).toBe(false);
    expect(Object.values(out).every((v) => v !== undefined)).toBe(true);
  });

  it('is much smaller than the record it came from', () => {
    const full = JSON.stringify(fullDriver()).length;
    const projected = JSON.stringify(projectDriver(fullDriver(), 'd1', 'owner-1')).length;
    expect(projected).toBeLessThan(full / 2);
  });
});

describe('isMarketplaceVisible', () => {
  it('hides pre-activated drivers', () => {
    expect(isMarketplaceVisible({ accountStatus: 'pre-activated' } as Driver)).toBe(false);
  });

  it('hides deactivated drivers', () => {
    expect(isMarketplaceVisible({ isActive: false } as Driver)).toBe(false);
  });

  it('shows a legacy driver with no accountStatus field', () => {
    // The field postdates most of the data. Treating absent as hidden would
    // empty the marketplace of every driver predating it — which is exactly
    // why this is filtered in code and not in the query.
    expect(isMarketplaceVisible({ name: 'Legacy' } as Driver)).toBe(true);
  });

  it('shows an active driver', () => {
    expect(isMarketplaceVisible({ accountStatus: 'active', isActive: true } as Driver)).toBe(true);
  });
});
