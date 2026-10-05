'use server';

/**
 * @fileOverview A driver profile summarization AI agent.
 *
 * - summarizeDriverProfile - A function that handles the driver profile summarization process.
 * - SummarizeDriverProfileInput - The input type for the summarizeDriverProfile function.
 * - SummarizeDriverProfileOutput - The return type for the summarizeDriverProfile function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizeDriverProfileInputSchema = z.object({
  // DEV-174: bounded. A profile is a paragraph or two; 5k characters is
  // ample and stops anyone pasting a book into the context window.
  driverProfile: z
    .string()
    .min(1)
    .max(5_000)
    .describe('The driver profile, containing information about qualifications, experience, and availability.'),
});
export type SummarizeDriverProfileInput = z.infer<typeof SummarizeDriverProfileInputSchema>;

const SummarizeDriverProfileOutputSchema = z.object({
  summary: z
    .string()
    .describe('A concise summary of the driver profile, highlighting key qualifications and experience.'),
});
export type SummarizeDriverProfileOutput = z.infer<typeof SummarizeDriverProfileOutputSchema>;

export async function summarizeDriverProfile(input: SummarizeDriverProfileInput): Promise<SummarizeDriverProfileOutput> {
  return summarizeDriverProfileFlow(input);
}

const prompt = ai.definePrompt({
  name: 'summarizeDriverProfilePrompt',
  input: {schema: SummarizeDriverProfileInputSchema},
  output: {schema: SummarizeDriverProfileOutputSchema},
  prompt: `You are an AI assistant that specializes in summarizing driver profiles for owner-operators.

  Given the following driver profile, create a concise summary highlighting key qualifications, experience, and availability that would be relevant for matching the driver with suitable loads.

  Driver Profile: {{{driverProfile}}} `,
});

const summarizeDriverProfileFlow = ai.defineFlow(
  {
    name: 'summarizeDriverProfileFlow',
    inputSchema: SummarizeDriverProfileInputSchema,
    outputSchema: SummarizeDriverProfileOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    // DEV-174: the model can return no structured output (safety filter, a
    // parse failure, an empty candidate). `output!` turned that into an
    // undefined masquerading as a typed object, which surfaces as a
    // confusing crash far from the cause. Fail here, where the cause is
    // obvious, and let the caller decide what to show the user.
    if (!output) {
      throw new Error('summarizeDriverProfileFlow: the model returned no structured output.');
    }
    return output;
  }
);
