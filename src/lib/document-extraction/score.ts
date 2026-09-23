/**
 * Scoring for the extraction eval.
 *
 * The headline number is NOT accuracy. It is the silent-error rate: how often
 * the model returns a confident value that is wrong. A missed field costs a
 * manual entry. A wrong expiry date written to a driver record produces a
 * compliance status nobody has reason to doubt, which is the failure this
 * feature could actually cause.
 *
 * Pure functions — no AI, no I/O. Unit-tested in score.test.ts.
 */

import { datesMatch, identifiersMatch, namesMatch } from './normalize';
import type { ExtractedDocument } from './schema';

/** Fields scored against ground truth. Coverage limits are extracted but not scored in v1. */
export const SCORED_FIELDS = ['documentType', 'expiryDate', 'documentNumber', 'namedParty'] as const;
export type ScoredField = (typeof SCORED_FIELDS)[number];

export type Outcome =
  /** Truth had a value; we matched it. */
  | 'correct'
  /** Truth had a value; we returned a DIFFERENT one. Silent error. */
  | 'wrong'
  /** Truth had a value; we returned null. Safe — falls back to manual entry. */
  | 'missed'
  /** Truth had no value; we invented one. Silent error. */
  | 'hallucinated'
  /** Truth had no value; we returned null. Correct abstention. */
  | 'absent';

/** Outcomes that would put a bad value into a driver record without anyone noticing. */
export const SILENT_ERROR_OUTCOMES: readonly Outcome[] = ['wrong', 'hallucinated'];

export interface FieldResult {
  field: ScoredField;
  outcome: Outcome;
  predicted: string | null;
  truth: string | null;
  /** The model's self-reported confidence for this field, 0–1. */
  confidence: number;
}

export interface DocumentResult {
  documentId: string;
  fields: FieldResult[];
}

/** Ground truth for one document — what a human already keyed in by hand. */
export interface GroundTruth {
  documentId: string;
  file: string;
  documentType: string | null;
  expiryDate: string | null;
  documentNumber: string | null;
  namedParty: string | null;
}

function comparatorFor(field: ScoredField) {
  switch (field) {
    case 'expiryDate':
      return datesMatch;
    case 'documentNumber':
      return identifiersMatch;
    case 'namedParty':
      return namesMatch;
    case 'documentType':
      return (a: string | null | undefined, b: string | null | undefined) =>
        !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
  }
}

function confidenceFor(extracted: ExtractedDocument, field: ScoredField): number {
  switch (field) {
    case 'expiryDate':
      return extracted.confidence.expiryDate;
    case 'documentNumber':
      return extracted.confidence.documentNumber;
    case 'namedParty':
      return extracted.confidence.namedParty;
    case 'documentType':
      return extracted.confidence.overall;
  }
}

function predictedFor(extracted: ExtractedDocument, field: ScoredField): string | null {
  const value = extracted[field];
  return typeof value === 'string' && value.trim() ? value : null;
}

export function scoreDocument(
  documentId: string,
  extracted: ExtractedDocument,
  truth: GroundTruth
): DocumentResult {
  const fields = SCORED_FIELDS.map((field): FieldResult => {
    const predicted = predictedFor(extracted, field);
    const truthValue = truth[field] && truth[field]!.trim() ? truth[field] : null;
    const confidence = confidenceFor(extracted, field);

    let outcome: Outcome;
    if (truthValue === null && predicted === null) outcome = 'absent';
    else if (truthValue === null) outcome = 'hallucinated';
    else if (predicted === null) outcome = 'missed';
    else outcome = comparatorFor(field)(predicted, truthValue) ? 'correct' : 'wrong';

    return { field, outcome, predicted, truth: truthValue, confidence };
  });

  return { documentId, fields };
}

export interface FieldSummary {
  field: ScoredField;
  counts: Record<Outcome, number>;
  /** correct / (correct + wrong + missed) — of the values that existed, how many did we get. */
  recall: number;
  /** correct / (correct + wrong) — when we answered, how often were we right. */
  precision: number;
  silentErrors: number;
}

export interface ThresholdPoint {
  threshold: number;
  /** Fields we would auto-apply at this threshold. */
  autoApplied: number;
  /** Of those, how many are wrong or hallucinated. */
  silentErrors: number;
  /** silentErrors / autoApplied. The number that decides whether this ships. */
  silentErrorRate: number;
  /** autoApplied / total scored fields. How much manual work this actually removes. */
  coverage: number;
}

export interface EvalSummary {
  documents: number;
  scoredFields: number;
  byField: FieldSummary[];
  thresholds: ThresholdPoint[];
  /** Every silent error, so they can be eyeballed. This is the list that matters. */
  silentErrorDetail: Array<FieldResult & { documentId: string }>;
}

const DEFAULT_THRESHOLDS = [0, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99];

export function summarize(
  results: DocumentResult[],
  thresholds: number[] = DEFAULT_THRESHOLDS
): EvalSummary {
  const all = results.flatMap((r) => r.fields.map((f) => ({ ...f, documentId: r.documentId })));

  const byField = SCORED_FIELDS.map((field): FieldSummary => {
    const rows = all.filter((r) => r.field === field);
    const counts: Record<Outcome, number> = {
      correct: 0, wrong: 0, missed: 0, hallucinated: 0, absent: 0,
    };
    for (const r of rows) counts[r.outcome]++;

    const existed = counts.correct + counts.wrong + counts.missed;
    const answered = counts.correct + counts.wrong;

    return {
      field,
      counts,
      recall: existed ? counts.correct / existed : 0,
      precision: answered ? counts.correct / answered : 0,
      silentErrors: counts.wrong + counts.hallucinated,
    };
  });

  const points = thresholds.map((threshold): ThresholdPoint => {
    // At a given threshold we auto-apply any field the model answered with at
    // least that confidence. Abstentions are never auto-applied — there is
    // nothing to apply — so they are excluded from the denominator.
    const applied = all.filter(
      (r) => r.predicted !== null && r.confidence >= threshold
    );
    const silent = applied.filter((r) => SILENT_ERROR_OUTCOMES.includes(r.outcome));

    return {
      threshold,
      autoApplied: applied.length,
      silentErrors: silent.length,
      silentErrorRate: applied.length ? silent.length / applied.length : 0,
      coverage: all.length ? applied.length / all.length : 0,
    };
  });

  return {
    documents: results.length,
    scoredFields: all.length,
    byField,
    thresholds: points,
    silentErrorDetail: all.filter((r) => SILENT_ERROR_OUTCOMES.includes(r.outcome)),
  };
}

/**
 * The lowest threshold whose silent-error rate is at or under `maxRate`, given
 * at least `minSamples` auto-applied fields at that point. Returns null when no
 * threshold qualifies — which is a legitimate result meaning "do not auto-apply
 * anything; propose every value for review".
 */
export function recommendThreshold(
  summary: EvalSummary,
  maxRate = 0.01,
  minSamples = 20
): ThresholdPoint | null {
  const qualifying = summary.thresholds
    .filter((p) => p.autoApplied >= minSamples && p.silentErrorRate <= maxRate)
    .sort((a, b) => a.threshold - b.threshold);
  return qualifying[0] ?? null;
}
