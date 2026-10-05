'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating compelling load descriptions from basic details provided by owner-operators.
 *
 * @function generateLoadDescription - Generates a load description based on input details.
 * @typedef {GenerateLoadDescriptionInput} GenerateLoadDescriptionInput - The input type for the generateLoadDescription function.
 * @typedef {GenerateLoadDescriptionOutput} GenerateLoadDescriptionOutput - The output type for the generateLoadDescription function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateLoadDescriptionInputSchema = z.object({
  // DEV-174: every string is bounded. Unbounded free text into a model is
  // both a cost problem and the widest prompt-injection surface we have.
  // The numbers are generous for real data and still cap the worst case.
  origin: z.string().min(1).max(200).describe('The origin location of the load.'),
  destination: z.string().min(1).max(200).describe('The destination location of the load.'),
  weight: z
    .number()
    .positive()
    .max(200_000)
    .describe('The weight of the load in pounds. Capped well above any legal gross weight.'),
  cargoType: z.string().min(1).max(200).describe('The type of cargo being hauled.'),
  additionalDetails: z
    .string()
    .max(2_000)
    .optional()
    .describe('Any additional details about the load.'),
});

export type GenerateLoadDescriptionInput = z.infer<typeof GenerateLoadDescriptionInputSchema>;

const GenerateLoadDescriptionOutputSchema = z.object({
  loadDescription: z.string().describe('A compelling description of the load.'),
});

export type GenerateLoadDescriptionOutput = z.infer<typeof GenerateLoadDescriptionOutputSchema>;

export async function generateLoadDescription(input: GenerateLoadDescriptionInput): Promise<GenerateLoadDescriptionOutput> {
  return generateLoadDescriptionFlow(input);
}

const loadDescriptionPrompt = ai.definePrompt({
  name: 'loadDescriptionPrompt',
  input: {schema: GenerateLoadDescriptionInputSchema},
  output: {schema: GenerateLoadDescriptionOutputSchema},
  prompt: `You are an expert in creating compelling load descriptions for a load board.
  Given the following details, generate an engaging and informative description to attract drivers.

  Origin: {{{origin}}}
  Destination: {{{destination}}}
  Weight: {{{weight}}} pounds
  Cargo Type: {{{cargoType}}}
  Additional Details: {{{additionalDetails}}}

  Write a description that is clear, concise, and highlights the key aspects of the load.
  Focus on attracting reliable drivers by providing all necessary information upfront.
  The description should be no more than 150 words.
  `,
});

const generateLoadDescriptionFlow = ai.defineFlow(
  {
    name: 'generateLoadDescriptionFlow',
    inputSchema: GenerateLoadDescriptionInputSchema,
    outputSchema: GenerateLoadDescriptionOutputSchema,
  },
  async input => {
    const {output} = await loadDescriptionPrompt(input);
    // DEV-174: the model can return no structured output (safety filter, a
    // parse failure, an empty candidate). `output!` turned that into an
    // undefined masquerading as a typed object, which surfaces as a
    // confusing crash far from the cause. Fail here, where the cause is
    // obvious, and let the caller decide what to show the user.
    if (!output) {
      throw new Error('generateLoadDescriptionFlow: the model returned no structured output.');
    }
    return output;
  }
);
