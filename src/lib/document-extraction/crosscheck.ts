/**
 * Cross-check an extracted document against the authoritative FMCSA record.
 *
 * This is the part worth having. Saving someone typing an expiry date is
 * convenience; a certificate whose named insured does not match the carrier
 * on the authority record is a fraud signal, and double-brokering commonly
 * presents exactly that way.
 *
 * IMPORTANT — this produces REVIEW FLAGS, not decisions. Nothing here may be
 * wired into match formation. The compliance gate stays deterministic on
 * QCMobile/SAFER; a language model's reading of a scanned PDF is not
 * authoritative and must never be the reason a driver is cleared or blocked.
 * Flags route to a human.
 */

import type { ExtractedDocument } from './schema';
import { namesMatch, nameSimilarity, normalizeRegistrationNumber } from './normalize';

/** The subset of an FMCSA/QCMobile record this comparison needs. */
export interface AuthorityRecord {
  legalName?: string | null;
  dbaName?: string | null;
  dotNumber?: string | null;
  mcNumber?: string | null;
}

export type FlagSeverity =
  /** Both sides present and they disagree. The signal that matters. */
  | 'mismatch'
  /** The document omitted something we would have compared. Weak signal. */
  | 'missing_on_document'
  /** We hold no authority value to compare against. Not the document's fault. */
  | 'missing_on_record';

export interface CrossCheckFlag {
  field: 'namedParty' | 'dotNumber' | 'mcNumber';
  severity: FlagSeverity;
  documentValue: string | null;
  recordValue: string | null;
  /** 0–1 for names; undefined for exact-match fields. */
  similarity?: number;
  reason: string;
}

export interface CrossCheckResult {
  /** True when no `mismatch` flags were raised. Weaker flags do not clear it. */
  consistent: boolean;
  flags: CrossCheckFlag[];
}

export function crossCheckAgainstAuthority(
  extracted: Pick<ExtractedDocument, 'namedParty' | 'dotNumber' | 'mcNumber'>,
  record: AuthorityRecord
): CrossCheckResult {
  const flags: CrossCheckFlag[] = [];

  // --- Named party vs legal name / DBA -------------------------------------
  const recordNames = [record.legalName, record.dbaName].filter(
    (n): n is string => typeof n === 'string' && n.trim().length > 0
  );

  if (!extracted.namedParty) {
    flags.push({
      field: 'namedParty',
      severity: 'missing_on_document',
      documentValue: null,
      recordValue: recordNames[0] ?? null,
      reason: 'No named party could be read from the document.',
    });
  } else if (recordNames.length === 0) {
    flags.push({
      field: 'namedParty',
      severity: 'missing_on_record',
      documentValue: extracted.namedParty,
      recordValue: null,
      reason: 'No legal name or DBA on the authority record to compare against.',
    });
  } else {
    // Match against whichever of legal name / DBA is the closer fit — a COI is
    // legitimately issued to either.
    const best = recordNames.reduce(
      (acc, name) => {
        const score = nameSimilarity(extracted.namedParty, name);
        return score > acc.score ? { name, score } : acc;
      },
      { name: recordNames[0], score: -1 }
    );

    if (!namesMatch(extracted.namedParty, best.name)) {
      flags.push({
        field: 'namedParty',
        severity: 'mismatch',
        documentValue: extracted.namedParty,
        recordValue: best.name,
        similarity: Number(best.score.toFixed(3)),
        reason:
          'Named party on the document does not match the carrier on the authority record. Common in double-brokering — review before accepting.',
      });
    }
  }

  // --- Registration numbers -------------------------------------------------
  for (const field of ['dotNumber', 'mcNumber'] as const) {
    const docValue = normalizeRegistrationNumber(extracted[field]);
    const recValue = normalizeRegistrationNumber(record[field]);

    if (!docValue && !recValue) continue;

    if (!docValue) {
      flags.push({
        field,
        severity: 'missing_on_document',
        documentValue: null,
        recordValue: recValue,
        reason: `No ${field === 'dotNumber' ? 'USDOT' : 'MC'} number printed on the document.`,
      });
      continue;
    }

    if (!recValue) {
      flags.push({
        field,
        severity: 'missing_on_record',
        documentValue: docValue,
        recordValue: null,
        reason: `Document carries a ${field === 'dotNumber' ? 'USDOT' : 'MC'} number but the record has none.`,
      });
      continue;
    }

    if (docValue !== recValue) {
      flags.push({
        field,
        severity: 'mismatch',
        documentValue: docValue,
        recordValue: recValue,
        reason: `${field === 'dotNumber' ? 'USDOT' : 'MC'} number on the document does not match the authority record.`,
      });
    }
  }

  return {
    consistent: !flags.some((f) => f.severity === 'mismatch'),
    flags,
  };
}
