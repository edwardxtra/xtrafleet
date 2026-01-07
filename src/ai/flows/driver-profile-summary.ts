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
  driverProfile: z
    .string()
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
    return output!;
  }
);
