/**
 * The Pit Boss: the LLM chat router. Given what was just said, it picks who talks next.
 *
 * Runs on the game's GM model (`game.gameMasterAiType`) rather than any bot's, so routing
 * cost and quality are independent of who happens to be sitting at the table.
 *
 * This module owns the *call*; the rules it is held to (eligibility, clamping, budget)
 * live in `lib/game/chat-router.ts` where they are pure and tested. A failed call throws
 * — there is no silent fallback, the player gets the error and the retry choice.
 */
import type { ApiKeyMap } from '@/config/models';
import { createAgent } from '@/lib/ai/agent-factory';
import { aiCall } from '@/lib/ai/errors';
import { buildPitBossCommand, buildPitBossSystemPrompt } from '@/lib/ai/prompts/pit-boss-prompts';
import { ChatRoutingSchema } from '@/lib/ai/types';
import { chatActivity, clampSpeakers, liveBots } from '@/lib/game/chat-router';
import { recordGmUsage } from '@/lib/cost-tracking';
import { effectiveModel, laneRetry, retryNote } from '@/lib/game/retry';
import { logger } from '@/lib/logging/logger';
import type { Game, GameMessage, Lane, RoutingCause } from '@/models/game';
import { PIT_BOSS } from '@/models/game';

export interface RoutingOptions {
  /** Speakers to guarantee. 0 means silence is an acceptable answer (reactions). */
  min: number;
  max: number;
}

export interface RoutingResult {
  speakers: string[];
  reasoning: string;
}

export async function routeChat(
  game: Game,
  recentChat: GameMessage[],
  apiKeys: ApiKeyMap,
  cause: RoutingCause,
  { min, max }: RoutingOptions,
): Promise<RoutingResult> {
  const candidates = liveBots(game)
    .map((b) => b.name)
    .filter((n) => n !== game.humanPlayerName);
  if (!candidates.length) return { speakers: [], reasoning: 'Nobody left to talk.' };

  const activity = chatActivity(game, recentChat);
  // A reaction to table talk is routed from inside the game pump, so it fails into the
  // game lane; a human message or a nudge belongs to the chat lane.
  const lane: Lane = cause.kind === 'reaction' ? 'game' : 'chat';
  const model = effectiveModel(game, PIT_BOSS, game.gameMasterAiType, lane);

  const reply = await aiCall(PIT_BOSS, model, () => {
    const agent = createAgent(PIT_BOSS, buildPitBossSystemPrompt(game, activity), model, apiKeys);
    return agent.askWithSchema(ChatRoutingSchema, [
      {
        role: 'user',
        content:
          buildPitBossCommand(cause, candidates, recentChat, max, min) +
          retryNote(laneRetry(game, lane), PIT_BOSS),
      },
    ]);
  });
  await recordGmUsage(game, model, reply);

  // A schema-valid but semantically wrong answer (hallucinated or dead name, the human,
  // too many) is repaired here rather than failed — the call itself worked.
  const { speakers, dropped } = clampSpeakers(reply.content.speakers ?? [], candidates, { min, max });
  if (dropped.length) {
    logger.warn('pit boss picked invalid speakers', { gameId: game.id, dropped });
  }
  return { speakers, reasoning: reply.content.reasoning ?? '' };
}
