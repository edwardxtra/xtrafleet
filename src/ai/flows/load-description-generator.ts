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
  origin: z.string().describe('The origin location of the load.'),
  destination: z.string().describe('The destination location of the load.'),
  weight: z.number().describe('The weight of the load in pounds.'),
  cargoType: z.string().describe('The type of cargo being hauled.'),
  additionalDetails: z.string().optional().describe('Any additional details about the load.'),
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
    return output!;
  }
);
