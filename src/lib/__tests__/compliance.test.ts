import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getComplianceStatus,
  getComplianceStatusFromItems,
  type ComplianceItem,
} from '../compliance';
import type { Driver } from '../data';

// All boundary tests assume "now" is 2026-01-15 so that expiry math is
// deterministic regardless of when the suite runs.
const NOW = new Date('2026-01-15T12:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function addDays(days: number): string {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function makeDriver(overrides: Partial<Driver> = {}): Driver {
  // A driver in the all-green baseline state. Each test overrides specific
  // fields to provoke a Red/Yellow result.
  const oneYearOut = addDays(365);
  const sixMonthsAgo = addDays(-180);
  return {
    id: 'driver-1',
    name: 'Test Driver',
    cdlLicense: 'CDL-12345',
    cdlExpiry: oneYearOut,
    medicalCardExpiry: oneYearOut,
    insuranceExpiry: oneYearOut,
    motorVehicleRecordNumber: 'MVR-1',
    backgroundCheckDate: sixMonthsAgo,
    preEmploymentScreeningDate: sixMonthsAgo,
    drugAndAlcoholScreeningDate: sixMonthsAgo,
    ...overrides,
  } as Driver;
}

describe('getComplianceStatus — missing required fields → Red', () => {
  const fields: (keyof Driver)[] = [
    'cdlLicense',
    'cdlExpiry',
    'medicalCardExpiry',
    'insuranceExpiry',
    'motorVehicleRecordNumber',
    'backgroundCheckDate',
    'preEmploymentScreeningDate',
    'drugAndAlcoholScreeningDate',
  ];
  for (const field of fields) {
    it(`returns Red when ${String(field)} is missing`, () => {
      const driver = makeDriver({ [field]: undefined } as Partial<Driver>);
      expect(getComplianceStatus(driver)).toBe('Red');
    });
  }
});

describe('getComplianceStatus — expiry boundaries', () => {
  it('returns Green when all expiries are far in the future', () => {
    expect(getComplianceStatus(makeDriver())).toBe('Green');
  });

  it('returns Red when CDL is already expired (past)', () => {
    expect(getComplianceStatus(makeDriver({ cdlExpiry: addDays(-1) }))).toBe('Red');
  });

  it('returns Yellow when CDL expires in 30 days (boundary, inclusive)', () => {
    expect(getComplianceStatus(makeDriver({ cdlExpiry: addDays(30) }))).toBe('Yellow');
  });

  it('returns Yellow when CDL expires in 29 days', () => {
    expect(getComplianceStatus(makeDriver({ cdlExpiry: addDays(29) }))).toBe('Yellow');
  });

  it('returns Green when CDL expires in 31 days (just past warning window)', () => {
    expect(getComplianceStatus(makeDriver({ cdlExpiry: addDays(31) }))).toBe('Green');
  });

  it('returns Yellow when medical card expires within warning window', () => {
    expect(getComplianceStatus(makeDriver({ medicalCardExpiry: addDays(15) }))).toBe('Yellow');
  });

  it('returns Red when insurance is expired', () => {
    expect(getComplianceStatus(makeDriver({ insuranceExpiry: addDays(-5) }))).toBe('Red');
  });
});

describe('getComplianceStatus — screening validity (1-year)', () => {
  it('returns Red when background check is older than 1 year', () => {
    expect(getComplianceStatus(makeDriver({ backgroundCheckDate: addDays(-400) }))).toBe('Red');
  });

  it('returns Yellow when background check is approaching 1-year mark', () => {
    // 11 months + a bit = within 30-day warning of the 1-year cutoff
    expect(getComplianceStatus(makeDriver({ backgroundCheckDate: addDays(-340) }))).toBe('Yellow');
  });

  it('returns Red when drug & alcohol screening is older than 1 year', () => {
    expect(getComplianceStatus(makeDriver({ drugAndAlcoholScreeningDate: addDays(-400) }))).toBe('Red');
  });

  it('returns Yellow when drug screening is in the warning window', () => {
    expect(getComplianceStatus(makeDriver({ drugAndAlcoholScreeningDate: addDays(-340) }))).toBe('Yellow');
  });
});

describe('getComplianceStatus — Red precedence over Yellow', () => {
  it('returns Red when one doc is expired and another is just expiring', () => {
    const driver = makeDriver({
      cdlExpiry: addDays(-1),
      medicalCardExpiry: addDays(10), // yellow on its own
    });
    expect(getComplianceStatus(driver)).toBe('Red');
  });
});

describe('getComplianceStatusFromItems — generic items helper', () => {
  it('returns Green when every item has a non-empty value and no expiry warnings', () => {
    const items: ComplianceItem[] = [
      { label: 'CDL #', value: 'CDL-1', type: 'field' },
      { label: 'CDL expiry', value: addDays(365), type: 'expiry' },
      { label: 'Background', value: addDays(-30), type: 'screening' },
    ];
    expect(getComplianceStatusFromItems(items)).toBe('Green');
  });

  it('returns Red when any value is missing', () => {
    const items: ComplianceItem[] = [
      { label: 'CDL #', value: 'CDL-1', type: 'field' },
      { label: 'CDL expiry', value: '', type: 'expiry' },
    ];
    expect(getComplianceStatusFromItems(items)).toBe('Red');
  });

  it('returns Red when an expiry is in the past', () => {
    const items: ComplianceItem[] = [
      { label: 'CDL expiry', value: addDays(-1), type: 'expiry' },
    ];
    expect(getComplianceStatusFromItems(items)).toBe('Red');
  });

  it('returns Yellow when an expiry is in the warning window', () => {
    const items: ComplianceItem[] = [
      { label: 'CDL #', value: 'CDL-1', type: 'field' },
      { label: 'CDL expiry', value: addDays(20), type: 'expiry' },
    ];
    expect(getComplianceStatusFromItems(items)).toBe('Yellow');
  });

  it('returns Red when an expiry value is not a valid date', () => {
    const items: ComplianceItem[] = [
      { label: 'CDL expiry', value: 'not-a-date', type: 'expiry' },
    ];
    expect(getComplianceStatusFromItems(items)).toBe('Red');
  });

  it('returns Yellow when a screening is approaching the 1-year cutoff', () => {
    const items: ComplianceItem[] = [
      { label: 'Background', value: addDays(-340), type: 'screening' },
    ];
    expect(getComplianceStatusFromItems(items)).toBe('Yellow');
  });

  it('returns Red when a screening is past 1 year', () => {
    const items: ComplianceItem[] = [
      { label: 'Background', value: addDays(-400), type: 'screening' },
    ];
    expect(getComplianceStatusFromItems(items)).toBe('Red');
  });
});
