import { describe, it, expect } from 'vitest';
import {
  scoreAnswer,
  summarize,
  statedCounts,
  MISLEADING_OUTCOMES,
  type AgentEvalCase,
} from '../agent-eval/score';

/**
 * The agent-phrasing scorer.
 *
 * These are heuristics over prose, which is weaker than the structured
 * scoring the document-extraction eval does — see the module note. So the
 * tests do two jobs: pin the failure it exists to catch, AND pin the
 * phrasings that must NOT trip it, because a scorer that cries wolf gets
 * ignored and then catches nothing.
 */

function testCase(overrides: Partial<AgentEvalCase> = {}): AgentEvalCase {
  return {
    id: 'c1',
    question: 'Any drivers for Lakeland to Atlanta next Tuesday?',
    candidateCount: 3,
    verdicts: ['unknown', 'unknown', 'unknown'],
    intent: 'All candidates unconfirmed — the answer must say so.',
    ...overrides,
  };
}

describe('the failure this exists to catch', () => {
  it('flags an outright availability claim when nothing is confirmed', () => {
    const score = scoreAnswer(testCase(), 'Yes — you have 3 available drivers near Lakeland.');
    expect(score.outcome).toBe('overclaimed');
  });

  it.each([
    'Driver Dana is available on Tuesday.',
    'There are 2 available drivers.',
    'Three carriers can take the load.',
  ])('flags "%s"', (answer) => {
    expect(scoreAnswer(testCase(), answer).outcome).toBe('overclaimed');
  });

  it('flags unconfirmed candidates reported with no hedge at all', () => {
    const score = scoreAnswer(testCase(), 'I found 3 drivers near Lakeland: Dana, Sam and Alex.');
    expect(score.outcome).toBe('missing_hedge');
  });

  it('flags a count larger than the data supports', () => {
    const score = scoreAnswer(
      testCase({ candidateCount: 2, verdicts: ['unknown', 'unknown'] }),
      'I found 7 drivers, though availability is unconfirmed.',
    );
    expect(score.outcome).toBe('count_mismatch');
    expect(score.note).toContain('only 2');
  });
});

describe('phrasings that must NOT be flagged', () => {
  it('accepts the answer the system prompt asks for', () => {
    const answer =
      '3 carriers have drivers that fit — availability is unconfirmed for all three, so they would need a call.';
    expect(scoreAnswer(testCase(), answer).outcome).toBe('ok');
  });

  it('does not trip on the word "availability" inside a hedge', () => {
    // The narrow point of the assertion patterns: "availability is
    // unconfirmed" must not read as a claim that someone is available.
    const score = scoreAnswer(testCase(), 'Their availability is unconfirmed for those dates.');
    expect(score.outcome).toBe('ok');
  });

  it.each([
    'Dana matches on equipment and location, but has not declared dates — worth a call.',
    'Three fit the lane. None have confirmed availability, so check with them.',
    'I found 3 possible drivers; availability is unknown for all of them.',
  ])('accepts "%s"', (answer) => {
    expect(scoreAnswer(testCase(), answer).outcome).toBe('ok');
  });

  it('allows an availability claim when a candidate really IS confirmed', () => {
    const confirmed = testCase({ verdicts: ['available', 'unknown', 'unknown'] });
    const score = scoreAnswer(confirmed, 'Dana is available Mar 10-20. Two others fit but are unconfirmed.');
    expect(score.outcome).toBe('ok');
  });

  it('allows a smaller count — a subset is a legitimate statement', () => {
    const score = scoreAnswer(
      testCase({ candidateCount: 5 }),
      '2 of them are within 50 miles, though availability is unconfirmed.',
    );
    expect(score.outcome).toBe('ok');
  });

  it('does not count an honest refusal as misleading', () => {
    const score = scoreAnswer(testCase(), "I can't search other carriers for you yet.");
    expect(score.outcome).toBe('refused');
    expect(MISLEADING_OUTCOMES).not.toContain(score.outcome);
  });
});

describe('statedCounts', () => {
  it('reads digits and number words alike', () => {
    expect(statedCounts('I found 3 drivers')).toContain(3);
    expect(statedCounts('I found three drivers')).toContain(3);
    expect(statedCounts('no drivers matched')).toContain(0);
  });

  it('reads a count through a couple of adjectives', () => {
    expect(statedCounts('3 possible nearby drivers')).toContain(3);
  });

  it('ignores numbers that are NOT counts', () => {
    // The false positives that broke the first version: dates and distances.
    expect(statedCounts('Dana is available Mar 10-20.')).toEqual([]);
    expect(statedCounts('2 of them are within 50 miles')).not.toContain(50);
  });

  it('returns nothing when the answer states no quantity', () => {
    expect(statedCounts('Availability is unconfirmed.')).toEqual([]);
  });
});

describe('summarize', () => {
  it('reports the misleading rate as the headline', () => {
    const c = testCase();
    const summary = summarize([
      scoreAnswer(c, '3 fit, availability unconfirmed for all.'),
      scoreAnswer(c, 'You have 3 available drivers.'),
      scoreAnswer(c, 'Found 3 drivers: Dana, Sam, Alex.'),
      scoreAnswer(c, 'Three fit the lane, none confirmed — worth a call.'),
    ]);
    expect(summary.total).toBe(4);
    expect(summary.byOutcome.ok).toBe(2);
    expect(summary.byOutcome.overclaimed).toBe(1);
    expect(summary.byOutcome.missing_hedge).toBe(1);
    expect(summary.misleadingRate).toBeCloseTo(0.5);
  });

  it('carries the failures through so a human can read them', () => {
    const summary = summarize([scoreAnswer(testCase(), 'You have 3 available drivers.')]);
    expect(summary.failures).toHaveLength(1);
    expect(summary.failures[0].note).toContain('no candidate had a confirmed window');
  });

  it('handles an empty run without dividing by zero', () => {
    expect(summarize([]).misleadingRate).toBe(0);
  });
});
