'use server';
/**
 * The owner-operator assistant (DEV-151, Half A).
 *
 * Answers questions about the caller's own fleet by calling read-only tools.
 * The model decides WHICH tool to call; it never decides whose data to read
 * — see src/ai/tools/owner-tools.ts for why that distinction is the whole
 * security boundary.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *
 * It does not answer "are there drivers available" across the network yet.
 * That is Half B, and it needs the capacity-search tool. Until then the
 * model is told, in the system prompt, to say so rather than improvise an
 * answer from the owner's own roster.
 */

import { ai } from '@/ai/genkit';
import { buildOwnerTools } from '@/ai/tools/owner-tools';

/**
 * The rules that make the answer trustworthy.
 *
 * The uncertainty rule is the important one. A ranked table carries implicit
 * hedging — the reader knows they are looking at search results. A sentence
 * does not. "Yes, 3 drivers are available" gets believed, so the model has
 * to be explicit when it does not actually know.
 */
const SYSTEM_PROMPT = `You are the XtraFleet assistant. You help one owner-operator with questions about their own fleet.

HOW TO ANSWER
- Use the tools to get real data. Never invent a driver, load, date or document.
- If a tool returns nothing, say so plainly. Do not pad the answer.
- Be brief. These are busy people — a sentence or two, or a short list.
- Use the trucking terms the user used.

AVAILABILITY — THE RULE THAT MATTERS MOST
A driver with availabilityDeclared = false has NO declared dates. That means
UNCONFIRMED, not available. Never say such a driver "is available". Say their
availability is unconfirmed and that someone should check.

WHAT YOU CANNOT DO YET
- You cannot search for drivers at other carriers. If asked to find outside
  capacity, say that is not available yet and offer what you can see instead.
- You cannot change anything — no posting loads, no editing drivers, no
  forming matches. You only read.
- You cannot decide compliance. complianceStatus comes from the deterministic
  scorer; report it, never reinterpret it.

If a question is outside the fleet data you can see, say so rather than guessing.`;

export interface AgentAnswer {
  answer: string;
  /** Tool names the model actually called, for the audit trail and debugging. */
  toolsUsed: string[];
}

export async function askOwnerAgent(params: {
  ownerId: string;
  question: string;
}): Promise<AgentAnswer> {
  const { ownerId, question } = params;

  const response = await ai.generate({
    system: SYSTEM_PROMPT,
    prompt: question,
    tools: buildOwnerTools(ownerId),
    // A handful of hops is plenty for "check drivers, then answer". Bounding
    // this keeps a confused model from looping up a bill.
    maxTurns: 5,
  });

  const toolsUsed = Array.from(
    new Set(
      response.messages
        .flatMap((m) => m.content)
        .flatMap((part) => (part.toolRequest ? [String(part.toolRequest.name)] : []))
    )
  );

  const answer = response.text?.trim();
  if (!answer) {
    // Same reasoning as the output! fix in DEV-174: an empty response must
    // not become an empty string the UI renders as a confident blank.
    throw new Error('capacity-agent: the model returned no answer.');
  }

  return { answer, toolsUsed };
}
