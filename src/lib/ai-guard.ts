/**
 * Shared guard for every AI entry point (DEV-174).
 *
 * WHY A SHARED MODULE RATHER THAN A PER-ROUTE CONVENTION
 *
 * The admin surface is the cautionary tale: 15 of 19 routes hand-roll the
 * same auth check, which is exactly the shape where one copy quietly
 * differs. An unmetered LLM endpoint behind user input is a cost and abuse
 * problem on day one, so the limit and the input cap belong in one place
 * that every flow calls, not in a note telling future routes to remember.
 *
 * TWO DISTINCT PROTECTIONS
 *
 *   Rate limit — how OFTEN one caller may invoke a flow.
 *   Input cap  — how LARGE a single invocation may be.
 *
 * Both are needed. A 50 MB PDF costs the same as hundreds of ordinary
 * requests, so a request-count limit alone does not bound spend.
 */
import { rateLimiters, getIdentifier, formatTimeRemaining } from './rate-limit';

export type AiFlowKind = 'documentExtraction' | 'capacityAgent';

export const AI_INPUT_LIMITS = {
  /**
   * Decoded bytes of an uploaded document. A COI or CDL scan is well under
   * 1 MB; 10 MB is generous for a multi-page PDF while still bounding the
   * worst case. Checked on the DECODED size, not the base64 string, so the
   * number means what a user would expect.
   */
  documentBytes: 10 * 1024 * 1024,
  /**
   * Characters of free text into a conversational flow. Long enough for a
   * realistic capacity request with context, short enough that nobody can
   * paste a novel into the context window.
   */
  promptChars: 2_000,
} as const;

/** Which limiter backs each flow. */
const LIMITER_FOR: Record<AiFlowKind, keyof typeof rateLimiters> = {
  documentExtraction: 'aiDocumentExtraction',
  capacityAgent: 'aiAgent',
};

export type GuardResult =
  | { ok: true }
  | { ok: false; status: 413 | 429 | 400; error: string };

/**
 * Decoded byte length of a base64 data URI, without materialising the bytes.
 *
 * Returns null when the string is not a data URI we can measure — callers
 * treat that as a validation failure rather than waving it through.
 */
export function dataUriByteLength(uri: string): number | null {
  const comma = uri.indexOf(',');
  if (!uri.startsWith('data:') || comma === -1) return null;
  const meta = uri.slice(5, comma);
  if (!meta.includes('base64')) return null;

  const payload = uri.slice(comma + 1);
  if (payload.length === 0) return 0;

  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.floor((payload.length * 3) / 4) - padding;
}

/** Is this document small enough to send to a model? */
export function checkDocumentSize(dataUri: string): GuardResult {
  const bytes = dataUriByteLength(dataUri);
  if (bytes === null) {
    return { ok: false, status: 400, error: 'Document must be a base64 data URI.' };
  }
  if (bytes > AI_INPUT_LIMITS.documentBytes) {
    const mb = (AI_INPUT_LIMITS.documentBytes / 1024 / 1024).toFixed(0);
    return {
      ok: false,
      status: 413,
      error: `Document is too large. The limit is ${mb} MB — try a lower-resolution scan.`,
    };
  }
  return { ok: true };
}

/** Is this free text short enough to send to a model? */
export function checkPromptLength(text: string): GuardResult {
  if (text.length > AI_INPUT_LIMITS.promptChars) {
    return {
      ok: false,
      status: 413,
      error: `Message is too long. The limit is ${AI_INPUT_LIMITS.promptChars} characters.`,
    };
  }
  return { ok: true };
}

/**
 * Rate-limit one caller against a flow's budget.
 *
 * Identified by user id when signed in, falling back to IP — the same
 * getIdentifier() every other rate-limited route uses, so an authenticated
 * caller cannot reset their budget by changing networks.
 */
export async function checkAiRateLimit(
  kind: AiFlowKind,
  request: Request,
  userId?: string
): Promise<GuardResult> {
  const limiter = rateLimiters[LIMITER_FOR[kind]];
  const { success, reset } = await limiter.limit(getIdentifier(request, userId));
  if (!success) {
    return {
      ok: false,
      status: 429,
      error: `Too many AI requests. Please try again in ${formatTimeRemaining(reset)}.`,
    };
  }
  return { ok: true };
}

/**
 * The single call an AI route should make before touching a model.
 *
 * Input caps are checked BEFORE the rate limit so an oversized request is
 * rejected without consuming the caller's budget — being told "too large"
 * and also losing a request would be a poor trade.
 */
export async function guardAiRequest(params: {
  kind: AiFlowKind;
  request: Request;
  userId?: string;
  /** Base64 data URI, for document flows. */
  documentDataUri?: string;
  /** Free text, for conversational flows. */
  prompt?: string;
}): Promise<GuardResult> {
  const { kind, request, userId, documentDataUri, prompt } = params;

  if (documentDataUri !== undefined) {
    const sized = checkDocumentSize(documentDataUri);
    if (!sized.ok) return sized;
  }
  if (prompt !== undefined) {
    const lengthed = checkPromptLength(prompt);
    if (!lengthed.ok) return lengthed;
  }

  return checkAiRateLimit(kind, request, userId);
}
