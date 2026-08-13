/**
 * Per-lane retry mechanics — pure functions, no LLM or Firestore imports (testable).
 *
 * The game lane (cards, betting, compaction) and the chat lane (intros, table talk) fail
 * and recover independently: each has its own error slot and its own retry plan, so a bot
 * that can't think of a quip never stops the deal.
 *
 * Retry itself is werewolf's: clearing the lane's error IS the retry — the pump wakes and
 * re-runs whatever step is still pending, with the queue untouched. What the clear leaves
 * behind is a one-shot `RetryPlan`, which makes the next attempt more than a repeat:
 * - `retryNote` tells the model its previous attempt failed and why, so a malformed or
 *   truncated response gets a corrective nudge rather than an identical prompt.
 * - `effectiveModel` honors the plan's model, from "Retry with another model".
 */
import type { Game, GameErrorState, Lane, RetryPlan } from '@/models/game';

/** Firestore field names per lane — the one place the flat field layout is spelled out. */
export const ERROR_FIELD: Record<Lane, 'gameError' | 'chatError'> = {
  game: 'gameError',
  chat: 'chatError',
};

export const RETRY_FIELD: Record<Lane, 'gameRetry' | 'chatRetry'> = {
  game: 'gameRetry',
  chat: 'chatRetry',
};

export function laneError(game: Game, lane: Lane): GameErrorState | null {
  return game[ERROR_FIELD[lane]] ?? null;
}

export function laneRetry(game: Game, lane: Lane): RetryPlan | null {
  return game[RETRY_FIELD[lane]] ?? null;
}

/** True while this lane is stopped waiting for the player to retry. */
export function laneBlocked(game: Game, lane: Lane): boolean {
  return laneError(game, lane) !== null;
}

/** The model a player's next call in this lane runs on, honoring a pending retry plan. */
export function effectiveModel(game: Game, player: string, baseModel: string, lane: Lane): string {
  const plan = laneRetry(game, lane);
  return plan && plan.actor === player && plan.model ? plan.model : baseModel;
}

/**
 * Appended to the prompt when this exact player's previous attempt in this lane failed.
 * Empty when there is nothing to learn from — a first attempt, or someone else's failure.
 */
export function retryNote(plan: RetryPlan | null | undefined, actor: string): string {
  if (!plan || plan.actor !== actor || !plan.hint) return '';
  return `

---
**YOUR PREVIOUS ATTEMPT AT THIS FAILED.** The error was:
${plan.hint}

That attempt produced nothing usable. Answer again from scratch, and if the failure looks like a formatting or length problem, keep this response simpler and strictly within the requested format.`;
}
