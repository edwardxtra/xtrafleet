'use server';

/**
 * @fileOverview Genkit flow that reads a compliance document and proposes
 * structured field values for human confirmation (DEV-153).
 *
 * Runs on the existing googleAI/Gemini setup in src/ai/genkit.ts — no new
 * vendor, no new key, no new data-processing relationship.
 *
 * WHAT THIS IS NOT: this does not decide anything. Output is a proposal that a
 * person confirms before it reaches a driver record, and it never touches the
 * compliance gate. The gate stays deterministic on QCMobile/SAFER data. That
 * boundary is the point — see docs/DOCUMENT_EXTRACTION_EVAL.md.
 *
 * @function extractComplianceDocument - Reads a document, returns proposed values.
 */

import { ai } from '@/ai/genkit';
import {
  ExtractDocumentInputSchema,
  ExtractedDocumentSchema,
  type ExtractDocumentInput,
  type ExtractedDocument,
} from '@/lib/document-extraction/schema';

export async function extractComplianceDocument(
  input: ExtractDocumentInput
): Promise<ExtractedDocument> {
  return documentExtractionFlow(input);
}

const documentExtractionPrompt = ai.definePrompt({
  name: 'documentExtractionPrompt',
  input: { schema: ExtractDocumentInputSchema },
  output: { schema: ExtractedDocumentSchema },
  prompt: `You are reading a trucking compliance document for a fleet management platform.
Transcribe what is printed on it. You are not interpreting or advising.

Document:
{{media url=documentDataUri}}

{{#if expectedDocumentType}}
The uploader filed this under "{{expectedDocumentType}}". Treat that as a hint only.
If the document is plainly something else, report what it actually is.
{{/if}}

Rules, in order of importance:

1. NEVER CALCULATE A DATE. Report expiryDate only when an expiry, "valid through",
   "valid until" or equivalent date is physically printed on the document. Medical
   certificates usually run two years and CDLs several — do not apply that knowledge.
   If only an issue date is printed, set issueDate and leave expiryDate null.

2. NULL BEATS A GUESS. Any field you cannot read with confidence is null. A null
   costs a person ten seconds of typing. A wrong value gets written to a driver's
   compliance record and nobody knows to question it.

3. TRANSCRIBE, DO NOT CORRECT. Copy names, policy numbers and licence numbers
   exactly as printed, including unusual spellings, spacing and dashes. If a name
   looks misspelled, that is data — a mismatch against the authority record is
   something a human needs to see, and silently fixing it destroys the signal.

4. DATES AS YYYY-MM-DD. US documents print month/day/year; convert carefully.
   If a date is ambiguous or partly illegible, null.

5. CONFIDENCE IS ABOUT LEGIBILITY, NOT PLAUSIBILITY. Score each field on how
   clearly you could actually read it on this page. Glare, a cut-off edge, a low
   resolution photo, handwriting over print: all lower confidence. Do not raise
   confidence because a value looks like what you would expect. A field you set
   to null has confidence 0.

6. FLAG WHAT LOOKS OFF. Use notes for anything a reviewer should see: conflicting
   dates, signs of alteration, a document that appears expired already, glare over
   a critical field, or a page that is obviously a partial scan.

For insurance certificates also capture coverageLimits. For every other document
type coverageLimits is null.`,
});

const documentExtractionFlow = ai.defineFlow(
  {
    name: 'documentExtractionFlow',
    inputSchema: ExtractDocumentInputSchema,
    outputSchema: ExtractedDocumentSchema,
  },
  async (input) => {
    const { output } = await documentExtractionPrompt(input);
    return output!;
  }
);
