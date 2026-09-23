/**
 * Schemas for AI-assisted compliance document extraction (DEV-153).
 *
 * Deliberately NOT in the `'use server'` flow file: Next.js only permits async
 * function exports from those, so schema values would break `next build`.
 *
 * SCOPE: extraction proposes values for a human to confirm. Nothing here feeds
 * the compliance gate. The gate stays deterministic on QCMobile/SAFER data —
 * see docs/DOCUMENT_EXTRACTION_EVAL.md for why that line matters.
 */

import { z } from 'genkit';

/**
 * The document kinds that map onto fields the compliance scorer already reads.
 * `other` is the honest answer for anything outside this list — better than
 * forcing a guess into a category that drives a date field.
 */
export const DOCUMENT_TYPES = [
  'insurance_coi',
  'cdl',
  'medical_certificate',
  'mvr',
  'drug_alcohol_screening',
  'background_check',
  'mc_authority',
  'w9',
  'bill_of_lading',
  'other',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/**
 * Per-field confidence rather than one number for the document. Legibility
 * varies inside a single page — a phone photo can have a crisp policy number
 * and a glare-washed expiry date, and one aggregate score hides exactly the
 * case we care about.
 */
export const ExtractionConfidenceSchema = z.object({
  overall: z.number().min(0).max(1).describe('Confidence that the document type is right and the page was readable.'),
  expiryDate: z.number().min(0).max(1).describe('Confidence in expiryDate specifically. 0 if not present or not legible.'),
  documentNumber: z.number().min(0).max(1).describe('Confidence in documentNumber specifically. 0 if not present or not legible.'),
  namedParty: z.number().min(0).max(1).describe('Confidence in namedParty specifically. 0 if not present or not legible.'),
});

export type ExtractionConfidence = z.infer<typeof ExtractionConfidenceSchema>;

export const ExtractedDocumentSchema = z.object({
  documentType: z
    .enum(DOCUMENT_TYPES)
    .describe('The kind of document. Use "other" when it does not clearly match one of the listed kinds.'),

  namedParty: z
    .string()
    .nullable()
    .describe(
      'The entity or person the document is about: named insured on a COI, licence holder on a CDL, driver on a medical certificate. Transcribe exactly as printed.'
    ),

  expiryDate: z
    .string()
    .nullable()
    .describe(
      'The date the document STOPS being valid, as YYYY-MM-DD. Only if a date is printed on the document. Never calculate it from an issue date.'
    ),

  issueDate: z
    .string()
    .nullable()
    .describe('The date the document was issued or became effective, as YYYY-MM-DD.'),

  documentNumber: z
    .string()
    .nullable()
    .describe('Policy number, licence number, certificate number or equivalent identifier. Transcribe exactly, including letters and dashes.'),

  issuingAuthority: z
    .string()
    .nullable()
    .describe('Who issued it: insurance carrier name, state DMV, medical examiner, FMCSA.'),

  dotNumber: z
    .string()
    .nullable()
    .describe('USDOT number if printed, digits only, no "USDOT" prefix.'),

  mcNumber: z
    .string()
    .nullable()
    .describe('MC / docket number if printed, digits only, no "MC" prefix.'),

  stateCode: z
    .string()
    .nullable()
    .describe('Two-letter state code where the document was issued, when applicable (e.g. the state on a CDL).'),

  coverageLimits: z
    .array(
      z.object({
        type: z.string().describe('Coverage type as printed, e.g. "Auto Liability", "Cargo".'),
        amount: z.string().describe('Limit as printed, e.g. "$1,000,000".'),
      })
    )
    .nullable()
    .describe('Only for insurance certificates. Null for every other document type.'),

  confidence: ExtractionConfidenceSchema,

  notes: z
    .string()
    .nullable()
    .describe('Anything a human reviewer should know: glare, a cut-off edge, conflicting dates, apparent alterations. Null if nothing notable.'),
});

export type ExtractedDocument = z.infer<typeof ExtractedDocumentSchema>;

export const ExtractDocumentInputSchema = z.object({
  documentDataUri: z
    .string()
    .describe("The document as a data URI: 'data:<mimetype>;base64,<encoded>'. Accepts image/* and application/pdf."),
  expectedDocumentType: z
    .enum(DOCUMENT_TYPES)
    .optional()
    .describe(
      'Optional hint from the upload slot the user chose. Omit to test blind classification — the eval harness always omits it.'
    ),
});

export type ExtractDocumentInput = z.infer<typeof ExtractDocumentInputSchema>;

/**
 * Which Driver fields each document type is allowed to propose. Used by the
 * review UI later so an extraction can never write into a field the document
 * has no business touching (a BOL must not set a medical card expiry).
 */
export const DOCUMENT_TYPE_TARGETS: Record<DocumentType, readonly string[]> = {
  insurance_coi: ['insuranceExpiry', 'insurerName', 'insurancePolicyNumber'],
  cdl: ['cdlLicense', 'cdlState', 'cdlClass', 'cdlExpiry'],
  medical_certificate: ['medicalCardExpiry'],
  mvr: ['motorVehicleRecordNumber'],
  drug_alcohol_screening: ['drugAndAlcoholScreeningDate'],
  background_check: ['backgroundCheckDate'],
  mc_authority: [],
  w9: [],
  bill_of_lading: [],
  other: [],
};
