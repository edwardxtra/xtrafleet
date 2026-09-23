import { describe, it, expect } from 'vitest';
import {
  normalizeDate,
  normalizeName,
  normalizeIdentifier,
  normalizeRegistrationNumber,
  nameSimilarity,
  namesMatch,
  datesMatch,
  identifiersMatch,
} from '@/lib/document-extraction/normalize';
import { crossCheckAgainstAuthority } from '@/lib/document-extraction/crosscheck';
import {
  scoreDocument,
  summarize,
  recommendThreshold,
  type GroundTruth,
} from '@/lib/document-extraction/score';
import type { ExtractedDocument } from '@/lib/document-extraction/schema';

// --- normalizeDate ---------------------------------------------------------
// The single most consequential function here: a date that survives
// normalisation gets written to a compliance record.

describe('normalizeDate', () => {
  it('passes through ISO dates', () => {
    expect(normalizeDate('2027-03-14')).toBe('2027-03-14');
  });

  it('zero-pads single-digit ISO components', () => {
    expect(normalizeDate('2027-3-4')).toBe('2027-03-04');
  });

  it('accepts unambiguous US m/d/Y', () => {
    expect(normalizeDate('3/14/2027')).toBe('2027-03-14');
    expect(normalizeDate('12-25-2027')).toBe('2027-12-25');
  });

  it('rejects rather than guesses when the first component could be a day', () => {
    // 03/04/2027 is March 4 in the US and April 3 elsewhere. Guessing here is
    // how a driver ends up with a compliance date that is wrong by a month.
    expect(normalizeDate('13/04/2027')).toBeNull();
  });

  it('rejects prose dates', () => {
    expect(normalizeDate('March 14, 2027')).toBeNull();
  });

  it('rejects dates that do not exist', () => {
    expect(normalizeDate('2027-02-30')).toBeNull();
    expect(normalizeDate('2027-13-01')).toBeNull();
  });

  it('treats empty and nullish input as null', () => {
    expect(normalizeDate('')).toBeNull();
    expect(normalizeDate('   ')).toBeNull();
    expect(normalizeDate(null)).toBeNull();
    expect(normalizeDate(undefined)).toBeNull();
  });
});

describe('datesMatch', () => {
  it('matches across formats', () => {
    expect(datesMatch('2027-03-14', '3/14/2027')).toBe(true);
  });

  it('does not treat two nulls as a match', () => {
    // Two missing values are not evidence of agreement.
    expect(datesMatch(null, null)).toBe(false);
  });
});

// --- name handling ---------------------------------------------------------

describe('normalizeName', () => {
  it('strips entity suffixes and punctuation', () => {
    expect(normalizeName('ABC Trucking, LLC')).toBe('ABC');
    expect(normalizeName('A.B.C. Transport Inc.')).toBe('A B C');
  });

  it('keeps the original tokens when everything would be stripped', () => {
    // "Trucking LLC" is all suffix — returning null would lose the only
    // identity we have, so fall back to the cleaned string.
    expect(normalizeName('Trucking LLC')).toBe('TRUCKING LLC');
  });

  it('returns null for empty input', () => {
    expect(normalizeName('   ')).toBeNull();
  });
});

describe('nameSimilarity / namesMatch', () => {
  it('treats entity-suffix variants as the same party', () => {
    expect(namesMatch('ABC Trucking LLC', 'ABC Trucking Co')).toBe(true);
  });

  it('separates genuinely different carriers', () => {
    expect(namesMatch('ABC Trucking', 'XYZ Transport')).toBe(false);
  });

  it('scores 1 for identical normalised names', () => {
    expect(nameSimilarity('ABC Trucking LLC', 'abc trucking llc')).toBe(1);
  });

  it('scores 0 when either side is missing', () => {
    expect(nameSimilarity(null, 'ABC')).toBe(0);
  });
});

// --- identifiers -----------------------------------------------------------

describe('identifier normalisation', () => {
  it('ignores dashes and case in policy numbers', () => {
    expect(identifiersMatch('pol-12345-a', 'POL12345A')).toBe(true);
  });

  it('strips prefixes and leading zeros from registration numbers', () => {
    expect(normalizeRegistrationNumber('USDOT 01234567')).toBe('1234567');
    expect(normalizeRegistrationNumber('MC-123456')).toBe('123456');
  });

  it('returns null when nothing usable remains', () => {
    expect(normalizeIdentifier('---')).toBeNull();
    expect(normalizeRegistrationNumber('USDOT')).toBeNull();
  });
});

// --- cross-check -----------------------------------------------------------

describe('crossCheckAgainstAuthority', () => {
  const base = { namedParty: 'ABC Trucking LLC', dotNumber: '1234567', mcNumber: '987654' };

  it('is consistent when the document matches the record', () => {
    const result = crossCheckAgainstAuthority(base, {
      legalName: 'ABC Trucking, Inc.',
      dotNumber: '1234567',
      mcNumber: 'MC-987654',
    });
    expect(result.consistent).toBe(true);
    expect(result.flags.filter((f) => f.severity === 'mismatch')).toHaveLength(0);
  });

  it('flags a named-party mismatch as the double-brokering signal', () => {
    const result = crossCheckAgainstAuthority(base, {
      legalName: 'Unrelated Freight Systems',
      dotNumber: '1234567',
      mcNumber: '987654',
    });
    expect(result.consistent).toBe(false);
    const flag = result.flags.find((f) => f.field === 'namedParty');
    expect(flag?.severity).toBe('mismatch');
    expect(flag?.similarity).toBeLessThan(0.8);
  });

  it('matches against the DBA when the legal name differs', () => {
    const result = crossCheckAgainstAuthority(base, {
      legalName: 'Holdings Entity Of Record',
      dbaName: 'ABC Trucking',
      dotNumber: '1234567',
      mcNumber: '987654',
    });
    expect(result.consistent).toBe(true);
  });

  it('flags a DOT number mismatch', () => {
    const result = crossCheckAgainstAuthority(base, {
      legalName: 'ABC Trucking LLC',
      dotNumber: '7654321',
      mcNumber: '987654',
    });
    expect(result.consistent).toBe(false);
    expect(result.flags.find((f) => f.field === 'dotNumber')?.severity).toBe('mismatch');
  });

  it('does not let a missing value masquerade as a mismatch', () => {
    const result = crossCheckAgainstAuthority(
      { namedParty: 'ABC Trucking LLC', dotNumber: null, mcNumber: null },
      { legalName: 'ABC Trucking LLC', dotNumber: '1234567', mcNumber: null }
    );
    expect(result.consistent).toBe(true);
    expect(result.flags.find((f) => f.field === 'dotNumber')?.severity).toBe('missing_on_document');
  });
});

// --- scoring ---------------------------------------------------------------

function extraction(overrides: Partial<ExtractedDocument> = {}): ExtractedDocument {
  return {
    documentType: 'insurance_coi',
    namedParty: 'ABC Trucking LLC',
    expiryDate: '2027-03-14',
    issueDate: '2026-03-14',
    documentNumber: 'POL-12345',
    issuingAuthority: 'Example Mutual',
    dotNumber: '1234567',
    mcNumber: '987654',
    stateCode: 'MA',
    coverageLimits: null,
    confidence: { overall: 0.95, expiryDate: 0.95, documentNumber: 0.9, namedParty: 0.9 },
    notes: null,
    ...overrides,
  };
}

function truth(overrides: Partial<GroundTruth> = {}): GroundTruth {
  return {
    documentId: 'doc-1',
    file: 'doc-1.pdf',
    documentType: 'insurance_coi',
    expiryDate: '2027-03-14',
    documentNumber: 'POL-12345',
    namedParty: 'ABC Trucking LLC',
    ...overrides,
  };
}

describe('scoreDocument', () => {
  it('marks matching fields correct', () => {
    const result = scoreDocument('doc-1', extraction(), truth());
    expect(result.fields.every((f) => f.outcome === 'correct')).toBe(true);
  });

  it('distinguishes a wrong answer from a missed one', () => {
    const wrong = scoreDocument('doc-1', extraction({ expiryDate: '2027-03-15' }), truth());
    expect(wrong.fields.find((f) => f.field === 'expiryDate')?.outcome).toBe('wrong');

    const missed = scoreDocument('doc-1', extraction({ expiryDate: null }), truth());
    expect(missed.fields.find((f) => f.field === 'expiryDate')?.outcome).toBe('missed');
  });

  it('marks an invented value as hallucinated', () => {
    const result = scoreDocument('doc-1', extraction(), truth({ expiryDate: null }));
    expect(result.fields.find((f) => f.field === 'expiryDate')?.outcome).toBe('hallucinated');
  });

  it('credits correct abstention', () => {
    const result = scoreDocument(
      'doc-1',
      extraction({ expiryDate: null }),
      truth({ expiryDate: null })
    );
    expect(result.fields.find((f) => f.field === 'expiryDate')?.outcome).toBe('absent');
  });

  it('accepts formatting differences that normalisation resolves', () => {
    const result = scoreDocument(
      'doc-1',
      extraction({ expiryDate: '3/14/2027', documentNumber: 'pol12345' }),
      truth()
    );
    expect(result.fields.find((f) => f.field === 'expiryDate')?.outcome).toBe('correct');
    expect(result.fields.find((f) => f.field === 'documentNumber')?.outcome).toBe('correct');
  });
});

describe('summarize', () => {
  it('counts silent errors separately from safe misses', () => {
    const results = [
      scoreDocument('a', extraction(), truth({ documentId: 'a' })),
      scoreDocument('b', extraction({ expiryDate: '2099-01-01' }), truth({ documentId: 'b' })),
      scoreDocument('c', extraction({ expiryDate: null }), truth({ documentId: 'c' })),
    ];
    const summary = summarize(results);
    const expiry = summary.byField.find((f) => f.field === 'expiryDate')!;

    expect(expiry.counts.correct).toBe(1);
    expect(expiry.counts.wrong).toBe(1);
    expect(expiry.counts.missed).toBe(1);
    expect(expiry.silentErrors).toBe(1);
    // A miss is not counted against precision — the model declined to answer.
    expect(expiry.precision).toBe(0.5);
    expect(summary.silentErrorDetail).toHaveLength(1);
  });

  it('excludes abstentions from the auto-apply denominator', () => {
    const results = [
      scoreDocument('a', extraction({ expiryDate: null }), truth({ documentId: 'a', expiryDate: null })),
    ];
    const summary = summarize(results, [0.5]);
    const point = summary.thresholds[0];
    // documentType/documentNumber/namedParty are answered; expiryDate is not.
    expect(point.autoApplied).toBe(3);
  });

  it('shows a high threshold filtering out a low-confidence error', () => {
    const results = [
      scoreDocument(
        'a',
        extraction({
          expiryDate: '2099-01-01',
          confidence: { overall: 0.95, expiryDate: 0.3, documentNumber: 0.9, namedParty: 0.9 },
        }),
        truth({ documentId: 'a' })
      ),
    ];
    const summary = summarize(results, [0, 0.8]);
    expect(summary.thresholds[0].silentErrors).toBe(1);
    expect(summary.thresholds[1].silentErrors).toBe(0);
  });
});

describe('recommendThreshold', () => {
  it('returns null when no threshold is clean enough to trust', () => {
    const results = Array.from({ length: 30 }, (_, i) =>
      scoreDocument(`d${i}`, extraction({ expiryDate: '2099-01-01' }), truth({ documentId: `d${i}` }))
    );
    expect(recommendThreshold(summarize(results))).toBeNull();
  });

  it('picks the lowest clean threshold once there is enough evidence', () => {
    const results = Array.from({ length: 30 }, (_, i) =>
      scoreDocument(`d${i}`, extraction(), truth({ documentId: `d${i}` }))
    );
    const recommended = recommendThreshold(summarize(results));
    expect(recommended).not.toBeNull();
    expect(recommended!.silentErrorRate).toBe(0);
    expect(recommended!.threshold).toBe(0);
  });

  it('refuses to recommend on too few samples', () => {
    const results = [scoreDocument('a', extraction(), truth())];
    expect(recommendThreshold(summarize(results), 0.01, 20)).toBeNull();
  });
});
