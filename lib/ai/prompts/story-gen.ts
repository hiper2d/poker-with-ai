import { z } from 'zod';
import { PERSONAS } from '@/config/personas';

export const StoryGenSchema = z.object({
  scene: z
    .string()
    .describe('2-4 sentences: why these characters gathered at this table and what is at stake'),
  players: z.array(
    z.object({
      name: z.string().describe('Short unique first name or alias'),
      gender: z.string(),
      story: z.string().describe('3-5 sentences of character background and table demeanor'),
      personaId: z.string().describe('One of the allowed persona ids'),
    }),
  ),
});

export type StoryGenResult = z.infer<typeof StoryGenSchema>;

export function buildStoryGenSystemPrompt(): string {
  const personaList = PERSONAS.map((p) => `- ${p.id}: ${p.label}`).join('\n');
  return `You are the Game Master of an AI poker night: a No-Limit Hold'em sit-n-go between colorful characters.
You will be given a theme, the human player's name, and how many bot characters to create.

Rules:
- Invent a scene: why exactly these characters sat down at this table tonight and what is at stake. Mention the human player by name as one of the participants.
- For known fictional universes, use canonical character names from that universe.
- Every character gets a distinct poker persona from this list (use the id verbatim, spread them out — no duplicates until all are used):
${personaList}
- Names must be unique, short, and never equal to the human player's name.
- Write stories in the second person ("You are...") — they are private briefings for each character.`;
}

export function buildStoryGenUserPrompt(theme: string, humanName: string, botCount: number): string {
  return `Theme: ${theme}\nHuman player: ${humanName}\nCreate exactly ${botCount} bot characters.\nFill in the scene field first, then the players.`;
}
