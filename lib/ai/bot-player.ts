import type { ApiKeyMap } from '@/config/models';
import { createAgent } from '@/lib/ai/agent-factory';
import {
  buildBotSystemPrompt,
  buildChatCompactionPrompt,
  buildChatReplyPrompt,
  buildContextCompactionPrompt,
  buildDecisionPrompt,
  buildIntroPrompt,
  buildReminderPostfix,
} from '@/lib/ai/prompts/bot-prompts';
import type { LegalActions } from '@/lib/engine/betting';
import { legalActions } from '@/lib/engine/betting';
import type { BettingAction } from '@/lib/engine/types';
import { messageCounterOf, unsummarizedChat } from '@/lib/game/compaction';
import { logger } from '@/lib/logging/logger';
import type { Bot, Game, GameMessage } from '@/models/game';
import { BettingDecisionSchema, CompactionSchema, type BettingDecision } from './types';

export interface BotTurn {
  action: BettingAction;
  reasoning: string;
  tableTalk?: string;
  costUsd?: number;
  durationMs: number;
}

/** One betting decision by a bot: structured LLM call + coercion into a legal action. */
export async function decideBotAction(
  game: Game,
  bot: Bot,
  recentChat: GameMessage[],
  apiKeys: ApiKeyMap,
): Promise<BotTurn> {
  const hand = game.hand;
  if (!hand || hand.toAct !== bot.name) throw new Error(`Not ${bot.name}'s turn`);
  const legal = legalActions(hand);

  // Chat before the bot's watermark lives on in its summaries — don't feed it twice.
  const freshChat = recentChat.filter((m) => messageCounterOf(m) > bot.chatWatermark);

  const agent = createAgent(bot.name, buildBotSystemPrompt(game, bot), bot.aiType, apiKeys);
  const reply = await agent.askWithSchema(BettingDecisionSchema, [
    {
      role: 'user',
      content:
        buildDecisionPrompt(game, hand, bot.name, legal, freshChat) + buildReminderPostfix(bot),
    },
  ]);

  const action = coerce(reply.content, bot.name, legal);
  return {
    action,
    reasoning: reply.content.reasoning,
    tableTalk: reply.content.tableTalk?.trim() || undefined,
    durationMs: reply.durationMs,
  };
}

/** In-character one-liner when the game opens. */
export async function botIntro(game: Game, bot: Bot, apiKeys: ApiKeyMap): Promise<string> {
  const agent = createAgent(bot.name, buildBotSystemPrompt(game, bot), bot.aiType, apiKeys);
  const reply = await agent.askText([{ role: 'user', content: buildIntroPrompt() }]);
  return reply.content.trim();
}

/** Free-chat reply (router/mention driven) — independent of the game loop. */
export async function botChatReply(
  game: Game,
  bot: Bot,
  recentChat: GameMessage[],
  apiKeys: ApiKeyMap,
): Promise<string> {
  // Compacted-away chat lives in the summaries riding in the system prompt.
  const freshChat = recentChat.filter((m) => messageCounterOf(m) > bot.chatWatermark);
  const agent = createAgent(bot.name, buildBotSystemPrompt(game, bot), bot.aiType, apiKeys);
  const reply = await agent.askText([
    { role: 'user', content: buildChatReplyPrompt(freshChat) + buildReminderPostfix(bot) },
  ]);
  return reply.content.trim();
}

export interface ChatCompactionResult {
  /** Formatted summary entry to append to bot.summaries. */
  entry: string;
  /** New chatWatermark: the highest message counter absorbed. */
  watermark: number;
}

function formatCompaction(
  handNumber: number,
  content: { summary: string; playerReads: { name: string; read: string }[] },
): string {
  const reads = content.playerReads.length
    ? `\nReads:\n${content.playerReads.map((r) => `- ${r.name}: ${r.read}`).join('\n')}`
    : '';
  return `[through hand #${handNumber}] ${content.summary}${reads}`;
}

/** COMPACT_CHAT: summarize un-summarized chat into a memory entry + advance watermark. */
export async function compactBotChat(
  game: Game,
  bot: Bot,
  messages: GameMessage[],
  apiKeys: ApiKeyMap,
): Promise<ChatCompactionResult> {
  const pending = unsummarizedChat(messages, bot.chatWatermark);
  const agent = createAgent(bot.name, buildBotSystemPrompt(game, bot), bot.aiType, apiKeys);
  const reply = await agent.askWithSchema(CompactionSchema, [
    { role: 'user', content: buildChatCompactionPrompt(game, bot, pending) },
  ]);
  const watermark = pending.reduce((max, m) => Math.max(max, messageCounterOf(m)), bot.chatWatermark);
  return { entry: formatCompaction(game.handNumber, reply.content), watermark };
}

/** COMPACT_CONTEXT: collapse S1..Sn into a single entry when they outgrow the budget. */
export async function compactBotContext(
  game: Game,
  bot: Bot,
  apiKeys: ApiKeyMap,
): Promise<string> {
  const agent = createAgent(bot.name, buildBotSystemPrompt(game, bot), bot.aiType, apiKeys);
  const reply = await agent.askWithSchema(CompactionSchema, [
    { role: 'user', content: buildContextCompactionPrompt(bot) },
  ]);
  return formatCompaction(game.handNumber, reply.content);
}

/** Never let a hallucinated action break the hand — degrade toward the safest legal move. */
function coerce(decision: BettingDecision, botName: string, legal: LegalActions): BettingAction {
  let { action, amount } = decision;

  if ((action === 'bet' || action === 'raise') && !legal.actions.includes(action)) {
    // requested aggression isn't available — try the other aggressive label, else call/check
    const alt = action === 'bet' ? 'raise' : 'bet';
    action = legal.actions.includes(alt) ? alt : legal.actions.includes('call') ? 'call' : 'check';
  }
  if (action === 'check' && !legal.actions.includes('check')) action = 'call';
  if (action === 'call' && !legal.actions.includes('call')) action = 'check';
  if (!legal.actions.includes(action)) action = 'fold';

  if (action === 'bet' || action === 'raise') {
    amount = Math.min(Math.max(amount ?? legal.minRaiseTo, legal.minRaiseTo), legal.maxRaiseTo);
  } else {
    amount = undefined;
  }

  if (action !== decision.action) {
    logger.warn('coerced bot action', { bot: botName, requested: decision.action, applied: action });
  }
  return { player: botName, type: action, amount };
}
