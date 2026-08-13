/**
 * Chat routing rules — pure functions, no LLM or Firestore imports (testable).
 *
 * The Pit Boss (see `lib/ai/pit-boss.ts`) makes the actual call; everything that has to
 * be *right* rather than merely plausible lives here: who is eligible, how a model's
 * answer is clamped back to reality, and how much talk the game can still afford.
 *
 * There is no heuristic fallback. A routing call that fails surfaces to the player as an
 * error with a retry choice — quietly picking random speakers would paper over a broken
 * key or a failing model and make the table look fine while it isn't.
 */
import { GAME_CONFIG } from '@/config/game';
import type { Bot, Game, GameMessage } from '@/models/game';

export function liveBots(game: Game): Bot[] {
  return game.bots.filter(
    (b) => game.seats.find((s) => s.name === b.name)?.status === 'active',
  );
}

// ---- Participation tracking ----

/** Message types that count as a bot having taken a turn to talk. */
const TALK_TYPES = ['BOT_ANSWER', 'TABLE_TALK'];

/** Bot chat replies are the metered spend: one reply = one model call we chose to make. */
const BILLED_TYPE = 'BOT_ANSWER';

export interface BotActivity {
  name: string;
  count: number;
}

/**
 * How much each live bot has talked recently, quietest first. Werewolf stores this as a
 * per-day counter on the game doc; we derive it from the message log instead — same
 * signal, no extra persisted state to migrate or keep in sync.
 */
export function chatActivity(game: Game, messages: GameMessage[], sinceHands = 3): BotActivity[] {
  const from = game.handNumber - sinceHands;
  const counts = new Map(liveBots(game).map((b) => [b.name, 0]));
  for (const m of messages) {
    if (!TALK_TYPES.includes(m.messageType) || m.handNumber < from) continue;
    const current = counts.get(m.authorName);
    if (current !== undefined) counts.set(m.authorName, current + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.count - b.count || a.name.localeCompare(b.name));
}

/** How many of the quietest bots get flagged to the Pit Boss as owed a turn. */
export const QUIET_BOT_COUNT = 2;

/** Activity line for the routing prompt, with the quietest bots flagged for inclusion. */
export function formatActivity(activity: BotActivity[]): string {
  if (!activity.length) return 'No players left to speak.';
  const quiet = new Set(activity.slice(0, QUIET_BOT_COUNT).map((a) => a.name));
  return activity
    .map((a) => `${a.name}: ${a.count} recent${quiet.has(a.name) ? ' ⚠️ OWED A TURN' : ''}`)
    .join(', ');
}

// ---- Clamping a model's answer back to reality ----

export interface ClampOptions {
  min: number;
  max: number;
  rng?: () => number;
}

export interface ClampResult {
  speakers: string[];
  dropped: string[];
}

/**
 * Reconcile the Pit Boss's picks with the live table: drop hallucinated, eliminated,
 * human and duplicate names, cap at `max`, and top up at random to `min`. A
 * semantically-wrong-but-schema-valid answer degrades into a worse pick, never an error.
 */
export function clampSpeakers(
  picked: string[],
  candidates: string[],
  { min, max, rng = Math.random }: ClampOptions,
): ClampResult {
  const valid = new Set(candidates);
  const speakers: string[] = [];
  const dropped: string[] = [];

  for (const name of picked) {
    if (valid.has(name) && !speakers.includes(name)) speakers.push(name);
    else dropped.push(name);
  }
  speakers.splice(max);

  if (speakers.length < min) {
    const pool = candidates.filter((n) => !speakers.includes(n)).sort(() => rng() - 0.5);
    while (speakers.length < min && pool.length) speakers.push(pool.shift()!);
  }
  return { speakers, dropped };
}

// ---- Spend guardrails ----

export interface ChatBudget {
  handUsed: number;
  handLimit: number;
  gameUsed: number;
  gameLimit: number;
  /** Replies still affordable right now — the binding limit of the two, never negative. */
  remaining: number;
  /** True when the per-game cap is spent: no more talk for the rest of the game. */
  gameExhausted: boolean;
}

/**
 * What the table can still afford to say. Free-tier games get a tighter allowance than
 * paid-tier games, where every call is billed to the player's balance anyway.
 */
export function chatBudget(game: Game, messages: GameMessage[]): ChatBudget {
  const limits =
    game.createdWithTier === 'free' ? GAME_CONFIG.chatBudget.free : GAME_CONFIG.chatBudget.default;

  let handUsed = 0;
  let gameUsed = 0;
  for (const m of messages) {
    if (m.messageType !== BILLED_TYPE) continue;
    gameUsed += 1;
    if (m.handNumber === game.handNumber) handUsed += 1;
  }

  return {
    handUsed,
    handLimit: limits.perHand,
    gameUsed,
    gameLimit: limits.perGame,
    remaining: Math.max(0, Math.min(limits.perHand - handUsed, limits.perGame - gameUsed)),
    gameExhausted: gameUsed >= limits.perGame,
  };
}

/**
 * Whether a bot's table talk should pull replies out of the table.
 *
 * Table talk arrives with a betting action on every street, so routing each one would
 * add a Pit Boss call per bot decision. Two gates keep that proportional: the table must
 * be quiet (nobody already queued to speak — talk that lands mid-conversation stands on
 * its own), and the budget must cover the replies.
 */
export function shouldRouteReaction(game: Game, budget: ChatBudget): boolean {
  return game.chatQueue.length === 0 && budget.remaining > 0;
}
