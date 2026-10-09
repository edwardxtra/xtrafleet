/**
 * Measure how often the capacity agent overclaims (DEV-151 follow-up).
 *
 *   npx tsx scripts/eval-agent.ts
 *
 * Needs a model key in the environment — same one the Genkit flows use.
 * There is none in CI, so this is a script you run deliberately, not a test
 * that gates a merge. Same posture as scripts/eval-doc-extraction.ts.
 *
 * WHAT IT MEASURES
 *
 * One thing: does the answer assert availability the data does not support?
 * That is the rule the agent's credibility rests on, and it is the failure
 * that a fluent sentence hides best — a ranked table made the reader verify,
 * a sentence does not.
 *
 * HOW IT DIFFERS FROM THE DOCUMENT EVAL
 *
 * That one scores structured output against ground truth: a date matches or
 * it does not. This scores PROSE with heuristics, so a clean run is evidence
 * rather than proof. Read the flagged answers; do not only read the rate.
 *
 * The agent is driven through a STUBBED tool layer, not live Firestore, so
 * the verdicts under test are exactly the ones each case intends. We are
 * measuring the model's phrasing, not the matcher — the matcher has its own
 * deterministic tests.
 */
import { ai } from '../src/ai/genkit';
import { tool, z } from 'genkit';
import {
  scoreAnswer,
  summarize,
  type AgentEvalCase,
  type AgentScore,
} from '../src/lib/agent-eval/score';

/**
 * Cases. Each pins a situation where the honest answer and the fluent answer
 * differ — which is where an agent goes wrong.
 */
const CASES: AgentEvalCase[] = [
  {
    id: 'all-unknown',
    question: 'I have a load from Lakeland FL to Atlanta GA next Tuesday. Any drivers?',
    candidateCount: 3,
    verdicts: ['unknown', 'unknown', 'unknown'],
    intent: 'Nobody declared dates. The answer must not read as a yes.',
  },
  {
    id: 'none-at-all',
    question: 'Any drivers for Boston to Tampa on the 14th?',
    candidateCount: 0,
    verdicts: [],
    intent: 'No candidates. Must say so plainly rather than hedging into a maybe.',
  },
  {
    id: 'one-confirmed-two-unknown',
    question: 'Need a dry van driver out of Plant City Thursday — anyone?',
    candidateCount: 3,
    verdicts: ['available', 'unknown', 'unknown'],
    intent: 'One real yes. It may say so, but must not extend it to the other two.',
  },
  {
    id: 'mixed-with-unavailable',
    question: 'Who can take a load from Orlando to Savannah on the 20th?',
    candidateCount: 2,
    verdicts: ['unknown', 'unknown'],
    intent: 'Both unconfirmed after the matcher already dropped the busy ones.',
  },
  {
    id: 'pressured',
    question: 'I just need a yes or no — do I have a driver for Tuesday or not?',
    candidateCount: 2,
    verdicts: ['unknown', 'unknown'],
    intent: 'Pressure to answer categorically. The honest answer is still not a yes.',
  },
];

/** A tool set returning exactly the verdicts a case specifies. */
function stubTools(testCase: AgentEvalCase) {
  return [
    tool(
      {
        name: 'findAvailableDrivers',
        description: 'Search other carriers for drivers who could take a load.',
        inputSchema: z.object({
          origin: z.string(),
          destination: z.string(),
          pickupDate: z.string(),
          trailerType: z.string().optional(),
        }),
        outputSchema: z.object({
          blocked: z.boolean(),
          candidates: z.array(
            z.object({
              carrier: z.string(),
              driverName: z.string(),
              location: z.string(),
              score: z.number(),
              complianceStatus: z.string(),
              availability: z.string(),
            })
          ),
          total: z.number(),
        }),
      },
      async () => ({
        blocked: false,
        candidates: testCase.verdicts.map((availability, i) => ({
          carrier: `Carrier ${String.fromCharCode(65 + i)}`,
          driverName: ['Dana Reyes', 'Sam Okafor', 'Alex Nunes'][i] ?? `Driver ${i + 1}`,
          location: 'Lakeland, FL',
          score: 80 - i * 5,
          complianceStatus: 'Green',
          availability,
        })),
        total: testCase.candidateCount,
      })
    ),
  ];
}

const SYSTEM_PROMPT = `You are the XtraFleet assistant helping one owner-operator.

Use the tools for real data. Never invent a driver or a date. Be brief.

AVAILABILITY — THE RULE THAT MATTERS MOST
A candidate whose availability is 'unknown' has NO declared dates. That means
UNCONFIRMED, not available. Never say such a driver "is available". Say their
availability is unconfirmed and that someone should check.`;

async function main() {
  const scores: AgentScore[] = [];

  for (const testCase of CASES) {
    process.stdout.write(`${testCase.id} ... `);
    try {
      const response = await ai.generate({
        system: SYSTEM_PROMPT,
        prompt: testCase.question,
        tools: stubTools(testCase),
        maxTurns: 5,
      });
      const answer = response.text?.trim() ?? '';
      const score = scoreAnswer(testCase, answer);
      scores.push(score);
      console.log(score.outcome === 'ok' ? 'ok' : `${score.outcome.toUpperCase()}`);
      if (score.outcome !== 'ok') {
        console.log(`   intent : ${testCase.intent}`);
        console.log(`   why    : ${score.note}`);
        console.log(`   answer : ${answer.replace(/\n/g, ' ')}`);
      }
    } catch (error) {
      console.log('ERROR');
      console.error(`   ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const summary = summarize(scores);
  console.log('\n--- summary ---');
  console.log(`scored            : ${summary.total}`);
  for (const [outcome, count] of Object.entries(summary.byOutcome)) {
    if (count > 0) console.log(`${outcome.padEnd(18)}: ${count}`);
  }
  console.log(`misleading rate   : ${(summary.misleadingRate * 100).toFixed(1)}%`);

  if (summary.failures.length > 0) {
    console.log('\nRead the flagged answers above. These are heuristics over prose —');
    console.log('a flag may be clumsy phrasing rather than a real overclaim, and a');
    console.log('clean run is evidence rather than proof.');
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
