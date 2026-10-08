import { describe, it, expect } from 'vitest';
import {
  expiryLevel,
  cdlSectionLevel,
  insuranceSectionLevel,
  licenseClassLevel,
  attestationsLevel,
  deriveOverallStatus,
  type ScorecardScope,
} from '@/lib/scorecard-visibility';
import type { Driver } from '@/lib/data';

/**
 * The bug these pin.
 *
 * Every section dot and the headline banner were derived from field PRESENCE.
 * Once some fields are withheld from some viewers, absent means two opposite
 * things — "the driver has no CDL" and "the CDL number is not yours" — and the
 * component rendered them identically.
 *
 * Measured before the fix: a driver with every document valid and nothing near
 * expiry, viewed as another carrier's, showed a RED headline banner and a RED
 * CDL dot. Not a missing row — a wrong verdict, in the most prominent element
 * on the panel.
 *
 * So each test below runs the SAME compliant driver through both scopes. The
 * marketplace answer must never be worse than the full one, because nothing
 * about the driver changed — only who is looking.
 */

const NOW = new Date('2026-06-01T12:00:00Z');
const iso = (offsetDays: number) =>
  new Date(NOW.getTime() + offsetDays * 86_400_000).toISOString().slice(0, 10);

/** Valid documents, nothing near expiry, every identifier present. */
function compliant(): Driver {
  return {
    id: 'd1',
    name: 'Dana Reyes',
    location: 'Lakeland, FL',
    availability: 'Available',
    vehicleType: 'Dry Van',
    certifications: [],
    isActive: true,
    ownerId: 'other-carrier',
    cdlExpiry: iso(400),
    medicalCardExpiry: iso(400),
    insuranceExpiry: iso(400),
    cdlLicense: 'S1234567',
    cdlState: 'FL',
    cdlClass: 'A',
    insurerName: 'Acme Mutual',
    insurancePolicyNumber: 'POL-55512',
    profileStatus: 'complete',
    profileComplete: true,
  } as Driver;
}

/** The same driver as the projection would deliver it: identifiers stripped. */
function projected(): Driver {
  const {
    cdlLicense: _a, cdlState: _b, cdlClass: _c,
    insurerName: _d, insurancePolicyNumber: _e,
    profileStatus: _f, profileComplete: _g,
    ...rest
  } = compliant();
  return rest as Driver;
}

const BOTH: ScorecardScope[] = ['full', 'marketplace'];

describe('expiryLevel', () => {
  it('grades a date by how far off it is', () => {
    expect(expiryLevel(iso(400), NOW)).toBe('green');
    expect(expiryLevel(iso(10), NOW)).toBe('yellow');
    expect(expiryLevel(iso(-1), NOW)).toBe('red');
  });

  it('treats a missing or unparseable date as red, not green', () => {
    // Failing closed: an unknown expiry must not read as a valid document.
    expect(expiryLevel(undefined, NOW)).toBe('red');
    expect(expiryLevel('not a date', NOW)).toBe('red');
    expect(expiryLevel('', NOW)).toBe('red');
  });
});

describe('the compliant driver scores the same in both scopes', () => {
  it('headline banner is Green either way', () => {
    for (const scope of BOTH) {
      const driver = scope === 'full' ? compliant() : projected();
      expect(deriveOverallStatus(driver, scope, NOW), scope).toBe('Green');
    }
  });

  it('CDL dot is green either way', () => {
    // This is the regression. Projected + marketplace used to be red.
    expect(cdlSectionLevel(compliant(), 'full', NOW)).toBe('green');
    expect(cdlSectionLevel(projected(), 'marketplace', NOW)).toBe('green');
  });

  it('insurance dot is green either way', () => {
    expect(insuranceSectionLevel(compliant(), 'full', NOW)).toBe('green');
    expect(insuranceSectionLevel(projected(), 'marketplace', NOW)).toBe('green');
  });
});

describe('withheld reads as unknown, never as a fault', () => {
  it('licence class is pending in marketplace scope, not yellow', () => {
    // Yellow is "something is wrong with this driver". Pending is "you are not
    // being shown this". The class is withheld, so only the second is true.
    expect(licenseClassLevel(projected(), 'marketplace')).toBe('pending');
    expect(licenseClassLevel(compliant(), 'full')).toBe('green');
  });

  it('attestations are pending in marketplace scope, not yellow', () => {
    expect(attestationsLevel(projected(), 'marketplace')).toBe('pending');
    expect(attestationsLevel(compliant(), 'full')).toBe('green');
  });

  it('marketplace scope ignores the withheld fields even when they are present', () => {
    // Scope-driven, not presence-driven. This is what makes the change safe to
    // ship before the client switch: the full document is still in the browser
    // today, and the panel must behave as though it were not.
    expect(licenseClassLevel(compliant(), 'marketplace')).toBe('pending');
    expect(attestationsLevel(compliant(), 'marketplace')).toBe('pending');
  });
});

describe('a genuine problem still shows as one in marketplace scope', () => {
  it('an expired CDL is red', () => {
    const expired = { ...projected(), cdlExpiry: iso(-5) };
    expect(cdlSectionLevel(expired, 'marketplace', NOW)).toBe('red');
    expect(deriveOverallStatus(expired, 'marketplace', NOW)).toBe('Red');
  });

  it('a CDL expiring inside the warning window is yellow', () => {
    const soon = { ...projected(), cdlExpiry: iso(10) };
    expect(cdlSectionLevel(soon, 'marketplace', NOW)).toBe('yellow');
    expect(deriveOverallStatus(soon, 'marketplace', NOW)).toBe('Yellow');
  });

  it('expired insurance is red', () => {
    const lapsed = { ...projected(), insuranceExpiry: iso(-1) };
    expect(insuranceSectionLevel(lapsed, 'marketplace', NOW)).toBe('red');
  });

  it('a driver with no CDL expiry at all is still Red, not excused as withheld', () => {
    // The loosening must apply to the withheld IDENTIFIERS only. The expiry
    // date is sent in both scopes, so its absence is a real finding.
    const { cdlExpiry: _dropped, ...noExpiry } = projected();
    expect(deriveOverallStatus(noExpiry as Driver, 'marketplace', NOW)).toBe('Red');
    expect(cdlSectionLevel(noExpiry as Driver, 'marketplace', NOW)).toBe('red');
  });
});

describe('full scope is unchanged', () => {
  it('still requires the CDL number for a green dot', () => {
    // The own-fleet pages depend on this: a record with no number is incomplete
    // and should say so.
    const { cdlLicense: _dropped, ...noNumber } = compliant();
    expect(cdlSectionLevel(noNumber as Driver, 'full', NOW)).toBe('red');
    expect(deriveOverallStatus(noNumber as Driver, 'full', NOW)).toBe('Red');
  });

  it('still flags a driver who never submitted their profile', () => {
    const { profileStatus: _a, profileComplete: _b, ...unsubmitted } = compliant();
    expect(attestationsLevel(unsubmitted as Driver, 'full')).toBe('yellow');
  });

  it('still flags a missing licence class', () => {
    const { cdlClass: _dropped, ...noClass } = compliant();
    expect(licenseClassLevel(noClass as Driver, 'full')).toBe('yellow');
  });
});
