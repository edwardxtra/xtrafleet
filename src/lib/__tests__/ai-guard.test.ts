import { describe, it, expect } from 'vitest';
import {
  dataUriByteLength,
  checkDocumentSize,
  checkPromptLength,
  guardAiRequest,
  AI_INPUT_LIMITS,
} from '../ai-guard';

/**
 * AI entry-point guard (DEV-174).
 *
 * Two protections that do different jobs: the rate limit bounds how OFTEN a
 * caller invokes a flow, the input cap bounds how LARGE one invocation is.
 * A request-count limit alone does not bound spend — one 50 MB PDF costs
 * what hundreds of ordinary calls cost.
 *
 * Note these run with Upstash unconfigured, so rate-limiting falls through
 * to the no-op limiter (the same path local dev and CI take). The size and
 * length caps are what is being asserted here; they are deliberately
 * independent of Redis so they hold even when Redis is down.
 */

/**
 * A data URI whose payload decodes to EXACTLY `bytes`.
 *
 * Padding matters: without it the helper rounds up to the next 3-byte group,
 * so an "exactly at the cap" case is really 1-2 bytes over and the assertion
 * tests the wrong thing.
 */
function dataUri(bytes: number, mime = 'image/png'): string {
  const groups = Math.ceil(bytes / 3);
  const remainder = bytes % 3;
  const padding = remainder === 0 ? '' : remainder === 1 ? '==' : '=';
  const base64 = 'A'.repeat(groups * 4 - padding.length) + padding;
  return `data:${mime};base64,${base64}`;
}

describe('the test helper itself', () => {
  it('produces payloads that decode to exactly the requested size', () => {
    // If this drifts, every cap assertion below is quietly testing the wrong
    // boundary — which is how the first version of this file passed a
    // "exactly at the cap" case that was really 2 bytes over.
    for (const n of [0, 1, 2, 3, 4, 100, 999_999, AI_INPUT_LIMITS.documentBytes]) {
      expect(dataUriByteLength(dataUri(n))).toBe(n);
    }
  });
});

describe('dataUriByteLength', () => {
  it('measures decoded bytes, not the base64 string length', () => {
    // "AAAA" decodes to 3 bytes.
    expect(dataUriByteLength('data:image/png;base64,AAAA')).toBe(3);
  });

  it('accounts for padding', () => {
    expect(dataUriByteLength('data:image/png;base64,AAA=')).toBe(2);
    expect(dataUriByteLength('data:image/png;base64,AA==')).toBe(1);
  });

  it('handles an empty payload', () => {
    expect(dataUriByteLength('data:image/png;base64,')).toBe(0);
  });

  it('returns null for anything it cannot measure', () => {
    expect(dataUriByteLength('https://example.com/doc.pdf')).toBeNull();
    expect(dataUriByteLength('data:image/png,notbase64')).toBeNull();
    expect(dataUriByteLength('')).toBeNull();
  });
});

describe('checkDocumentSize', () => {
  it('accepts a realistic scan', () => {
    expect(checkDocumentSize(dataUri(800_000)).ok).toBe(true);
  });

  it('rejects a document over the cap with 413 and an actionable message', () => {
    const result = checkDocumentSize(dataUri(AI_INPUT_LIMITS.documentBytes + 10_000));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.status).toBe(413);
    expect(result.error).toContain('10 MB');
    expect(result.error).toContain('lower-resolution');
  });

  it('rejects a non-data-URI as a validation error, not a size error', () => {
    // A URL would otherwise sail past an unwary size check entirely.
    const result = checkDocumentSize('https://example.com/huge.pdf');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.status).toBe(400);
  });

  it('accepts a document exactly at the cap', () => {
    expect(checkDocumentSize(dataUri(AI_INPUT_LIMITS.documentBytes)).ok).toBe(true);
  });
});

describe('checkPromptLength', () => {
  it('accepts a realistic capacity request', () => {
    const text = 'I have a load going from Lakeland FL to Atlanta GA next Tuesday, dry van, need a driver.';
    expect(checkPromptLength(text).ok).toBe(true);
  });

  it('rejects text over the cap with 413', () => {
    const result = checkPromptLength('x'.repeat(AI_INPUT_LIMITS.promptChars + 1));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.status).toBe(413);
  });

  it('accepts text exactly at the cap', () => {
    expect(checkPromptLength('x'.repeat(AI_INPUT_LIMITS.promptChars)).ok).toBe(true);
  });
});

describe('guardAiRequest', () => {
  const request = new Request('https://xtrafleet.test/api/agent', { method: 'POST' });

  it('passes a well-formed document request', async () => {
    const result = await guardAiRequest({
      kind: 'documentExtraction',
      request,
      userId: 'user-1',
      documentDataUri: dataUri(500_000),
    });
    expect(result.ok).toBe(true);
  });

  it('passes a well-formed prompt request', async () => {
    const result = await guardAiRequest({
      kind: 'capacityAgent',
      request,
      userId: 'user-1',
      prompt: 'Any drivers free next week for Boston to Tampa?',
    });
    expect(result.ok).toBe(true);
  });

  it('rejects an oversized document BEFORE spending the caller budget', async () => {
    // Being told "too large" and also losing a request would be a poor trade,
    // so the cap is checked ahead of the limiter.
    const result = await guardAiRequest({
      kind: 'documentExtraction',
      request,
      documentDataUri: dataUri(AI_INPUT_LIMITS.documentBytes + 1),
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.status).toBe(413);
  });

  it('rejects an oversized prompt', async () => {
    const result = await guardAiRequest({
      kind: 'capacityAgent',
      request,
      prompt: 'x'.repeat(AI_INPUT_LIMITS.promptChars + 1),
    });
    expect(result.ok).toBe(false);
  });

  it('checks only the inputs it was given', async () => {
    // A flow with neither a document nor a prompt still gets rate limited.
    expect((await guardAiRequest({ kind: 'capacityAgent', request })).ok).toBe(true);
  });
});
