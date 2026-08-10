/**
 * Compaction scheduling — pure functions, no LLM or Firestore imports (testable).
 *
 * Two processes, same machinery, both run as events on the main game queue between hands:
 * - COMPACT_CHAT: the bot summarizes un-summarized table talk into a new summary entry
 *   (plus per-player reads) and advances its chatWatermark past what it absorbed.
 * - COMPACT_CONTEXT: when a bot's accumulated summaries outgrow the token threshold,
 *   it collapses S1..Sn into one entry.
 */
import { GAME_CONFIG } from '@/config/game';
import type { Game, GameEvent, GameMessage } from '@/models/game';

/** Rough chars/4 heuristic — consistent over/under matters more than accuracy here. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Message ids are `${counter:06d}-author-to-recipient`; parseInt stops at the dash. */
export function messageCounterOf(m: GameMessage): number {
  return m.id ? parseInt(m.id, 10) || 0 : 0;
}

/** The message types a bot "hears" as conversation (mirror of play-actions' chatVisible). */
export const CHAT_CONTEXT_TYPES = [
  'TABLE_TALK',
  'HUMAN_PLAYER_MESSAGE',
  'BOT_INTRO',
  'BOT_ANSWER',
];

/** Chat a bot has heard but not yet folded into a summary. */
export function unsummarizedChat(messages: GameMessage[], watermark: number): GameMessage[] {
  return messages.filter(
    (m) =>
      CHAT_CONTEXT_TYPES.includes(m.messageType) &&
      typeof m.msg === 'string' &&
      messageCounterOf(m) > watermark,
  );
}

export function chatLines(messages: GameMessage[]): string {
  return messages
    .map((m) => `${m.authorName}: ${typeof m.msg === 'string' ? m.msg : ''}`)
    .filter((l) => !l.endsWith(': '))
    .join('\n');
}

/**
 * Decides which bots compact between this hand and the next. Called from HAND_RESULTS
 * with the full message list; returns queue events (possibly empty).
 * - On interval boundaries every live bot with enough new chat compacts.
 * - Off-interval, only a bot whose un-summarized chat blew past the hard threshold.
 * - A bot whose summaries alone outgrew the context threshold gets COMPACT_CONTEXT
 *   even without new chat.
 */
export function buildCompactionEvents(game: Game, messages: GameMessage[]): GameEvent[] {
  const onInterval =
    game.handNumber > 0 && game.handNumber % GAME_CONFIG.compactionIntervalHands === 0;
  const events: GameEvent[] = [];

  for (const bot of game.bots) {
    const seat = game.seats.find((s) => s.name === bot.name);
    if (seat?.status !== 'active') continue;

    const pending = estimateTokens(chatLines(unsummarizedChat(messages, bot.chatWatermark)));
    if (
      pending >= GAME_CONFIG.chatCompactionTokenThreshold ||
      (onInterval && pending >= GAME_CONFIG.chatCompactionMinTokens)
    ) {
      events.push({ actor: bot.name, kind: 'COMPACT_CHAT' });
    } else if (
      estimateTokens(bot.summaries.join('\n')) > GAME_CONFIG.contextCompactionTokenThreshold
    ) {
      events.push({ actor: bot.name, kind: 'COMPACT_CONTEXT' });
    }
  }
  return events;
}
