import type { Game, GameEvent, GameState } from '@/models/game';

export interface StateResult {
  game: Game;
  /** Events to append to the game queue (e.g. scheduled compactions). */
  enqueue?: GameEvent[];
  /** Explicit transition; when omitted, the state-graph `next` resolver decides. */
  transitionTo?: GameState;
}

/**
 * One implementation per game state, resolved via the registry.
 * `prepare` runs on entering the state and seeds the queue;
 * `handle` processes one queue event per server-action call (client pump drives it).
 */
export interface StateHandler {
  prepare(game: Game): Promise<StateResult>;
  handle(game: Game, event: GameEvent): Promise<StateResult>;
}

export type StateHandlerFactory = () => StateHandler;
