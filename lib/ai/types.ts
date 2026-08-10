import { z } from 'zod';

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
}

export interface AgentReply<T = string> {
  content: T;
  thinking?: string;
  usage?: TokenUsage;
  durationMs: number;
}

/** The structured output of a bot's betting turn — the heart of the game loop. */
export const BettingDecisionSchema = z.object({
  action: z.enum(['fold', 'check', 'call', 'bet', 'raise']),
  amount: z.number().int().nonnegative().optional().describe('For bet/raise: total amount to raise TO'),
  reasoning: z.string().describe('Private reasoning, never shown to other players'),
  tableTalk: z.string().optional().describe('Optional in-character comment said aloud at the table'),
});

export type BettingDecision = z.infer<typeof BettingDecisionSchema>;

/** Output of a compaction call (chat or context — same shape). */
export const CompactionSchema = z.object({
  summary: z.string().describe('Narrative summary of the period being compacted'),
  playerReads: z.array(
    z.object({ name: z.string(), read: z.string().describe('Style, tells, bluff history') }),
  ),
});

export type Compaction = z.infer<typeof CompactionSchema>;
