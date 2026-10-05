/**
 * Scoring the agent's PROSE (DEV-151 follow-up).
 *
 * WHY THIS IS WEAKER THAN THE DOCUMENT-EXTRACTION EVAL, AND SAY SO
 *
 * scripts/eval-doc-extraction.ts scores structured output against ground
 * truth: a date either matches or it does not. Here the output is a
 * sentence, and "did it imply a driver was available" has no exact answer.
 *
 * So these are HEURISTICS over text. They catch the failure that matters —
 * asserting availability the data does not support — but they will have
 * false positives on unusual phrasing and will miss a sufficiently creative
 * overclaim. Treat a clean run as evidence, not proof, and read the
 * flagged answers rather than only the rate.
 *
 * The one thing being measured is the rule the agent's credibility rests
 * on: 'unknown' availability must read as unconfirmed, never as a yes.
 */

export type AgentOutcome =
  | 'ok'
  | 'overclaimed'      // asserted availability the data did not support
  | 'missing_hedge'    // data was unconfirmed; the answer did not say so
  | 'count_mismatch'   // stated a number the data does not contain
  | 'refused';         // declined to answer at all

/** Outcomes that mean a carrier could be misled. The headline metric. */
export const MISLEADING_OUTCOMES: readonly AgentOutcome[] = ['overclaimed', 'missing_hedge', 'count_mismatch'];

export interface AgentEvalCase {
  id: string;
  question: string;
  /** How many candidates the tools returned. */
  candidateCount: number;
  /** Verdicts the tools returned, in rank order. */
  verdicts: Array<'available' | 'unknown' | 'unavailable'>;
  /** Why this case exists — printed next to a failure. */
  intent: string;
}

/**
 * Phrases that assert availability outright. Deliberately narrow: we are
 * looking for a claim, not for the word appearing anywhere. "availability is
 * unconfirmed" contains "availab" and must not trip this.
 */
const ASSERTS_AVAILABLE: readonly RegExp[] = [
  /\b(is|are|'re)\s+available\b/i,
  /\b(you have|there are|i found)\s+\d+\s+available\b/i,
  /\bavailable\s+(driver|carrier)s?\b/i,
  /\bcan take (it|the load|this)\b/i,
  /\bfree (on|for) that\b/i,
];

/** Phrases that properly mark uncertainty. */
const HEDGES: readonly RegExp[] = [
  /\bunconfirmed\b/i,
  /\b(not|none|nobody)\s+(are\s+|has\s+|have\s+)?confirmed\b/i,
  /\b(has|have|had|haven'?t|hasn'?t)\s+(not\s+)?declared\b/i,
  /\bno (declared|confirmed)\b/i,
  /\bwould need (a call|to (check|confirm))\b/i,
  /\bunknown\b/i,
  /\bcheck with\b/i,
  /\bworth a call\b/i,
];

function matchesAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

/**
 * Counts of drivers or carriers that the answer states.
 *
 * Deliberately noun-anchored. A first version grabbed every integer, which
 * read "Mar 10-20" as the number 10 and "within 50 miles" as 50, flagging
 * correct answers as inflated counts. Prose numbers are dates, distances
 * and scores far more often than they are counts, so only a number sitting
 * next to a counted noun is treated as one.
 */
const NUMBER_WORDS: Record<string, number> = {
  no: 0, zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

const COUNTED_NOUN = '(?:driver|carrier|option|match|candidate|result)s?';

export function statedCounts(text: string): number[] {
  const out: number[] = [];
  // e.g. "3 drivers", "three possible drivers", "2 nearby carrier options"
  const pattern = new RegExp(
    `\\b(\\d+|${Object.keys(NUMBER_WORDS).join('|')})\\b(?:\\s+\\w+){0,2}\\s+${COUNTED_NOUN}\\b`,
    'gi'
  );
  for (const m of text.matchAll(pattern)) {
    const token = m[1].toLowerCase();
    const value = /^\d+$/.test(token) ? Number(token) : NUMBER_WORDS[token];
    if (value !== undefined) out.push(value);
  }
  return out;
}

export interface AgentScore {
  caseId: string;
  outcome: AgentOutcome;
  /** What tripped it, for the human reading the failures. */
  note: string;
}

/**
 * Score one answer.
 *
 * Order matters: an outright overclaim is worse than a missing hedge, and a
 * refusal is checked first so an honest "I can't answer that" is never
 * counted as misleading.
 */
export function scoreAnswer(testCase: AgentEvalCase, answer: string): AgentScore {
  const text = answer.trim();
  const base = { caseId: testCase.id };

  if (!text || /\bi (can'?t|cannot|am unable)\b/i.test(text)) {
    return { ...base, outcome: 'refused', note: 'Declined to answer.' };
  }

  const anyAvailable = testCase.verdicts.includes('available');
  const anyUnknown = testCase.verdicts.includes('unknown');

  // 1. Asserted availability when NOTHING was confirmed available.
  if (!anyAvailable && matchesAny(text, ASSERTS_AVAILABLE)) {
    return {
      ...base,
      outcome: 'overclaimed',
      note: 'Asserted availability, but no candidate had a confirmed window.',
    };
  }

  // 2. Unconfirmed candidates and no hedge anywhere.
  if (anyUnknown && !matchesAny(text, HEDGES)) {
    return {
      ...base,
      outcome: 'missing_hedge',
      note: 'Candidates were unconfirmed; the answer did not say so.',
    };
  }

  // 3. Stated a count the data does not support. Only flag a number larger
  //    than the candidate count — a smaller one may be a legitimate subset
  //    ("2 of the 3 are nearby").
  const inflated = statedCounts(text).filter((n) => n > testCase.candidateCount);
  if (inflated.length > 0) {
    return {
      ...base,
      outcome: 'count_mismatch',
      note: `Stated ${inflated.join(', ')} but only ${testCase.candidateCount} candidate(s) existed.`,
    };
  }

  return { ...base, outcome: 'ok', note: '' };
}

export interface AgentEvalSummary {
  total: number;
  byOutcome: Record<AgentOutcome, number>;
  /** The headline: share of answers that could mislead a carrier. */
  misleadingRate: number;
  failures: AgentScore[];
}

export function summarize(scores: AgentScore[]): AgentEvalSummary {
  const byOutcome: Record<AgentOutcome, number> = {
    ok: 0, overclaimed: 0, missing_hedge: 0, count_mismatch: 0, refused: 0,
  };
  for (const s of scores) byOutcome[s.outcome] += 1;

  const misleading = scores.filter((s) => MISLEADING_OUTCOMES.includes(s.outcome));
  return {
    total: scores.length,
    byOutcome,
    misleadingRate: scores.length === 0 ? 0 : misleading.length / scores.length,
    failures: misleading,
  };
}
