import { buildCompactionEvents } from '@/lib/game/compaction';
import type { Game, GameMessage, GameState } from '@/models/game';
import { GAME_STATES } from '@/models/game';

/**
 * State transitions as pure data — the single source of truth the game pump
 * (app/actions/play-actions.ts) consults at every transition point. Transition
 * conditions may read the message log (compaction needs it), never IO.
 *
 * The live machine:
 *   WELCOME → BETTING                 (intros run on the chat queue; deal immediately)
 *   BETTING → BETTING                 (one action per pump call until the hand completes)
 *   BETTING → HAND_RESULTS            (hand complete → settle)
 *   HAND_RESULTS → GAME_OVER          (fewer than 2 seats alive)
 *   HAND_RESULTS → COMPACTION         (bots have memory work queued between hands)
 *   HAND_RESULTS → BETTING            (deal the next hand)
 *   COMPACTION → COMPACTION           (one COMPACT_* event per pump call)
 *   COMPACTION → BETTING              (queue drained → deal)
 *   GAME_OVER → GAME_OVER             (terminal)
 *
 * HAND_SETUP and SHOWDOWN exist in the GameState type but the pump never parks a game
 * there — dealing and showdown resolve inside a single pump step. They stay in the graph
 * as pass-through aliases so every GameState has a defined successor.
 */
export interface StateNode {
  next: GameState | ((game: Game, messages: GameMessage[]) => GameState);
}

export const STATE_GRAPH: Record<GameState, StateNode> = {
  [GAME_STATES.WELCOME]: { next: GAME_STATES.BETTING },
  [GAME_STATES.HAND_SETUP]: { next: GAME_STATES.BETTING }, // alias — never parked in
  [GAME_STATES.BETTING]: {
    next: (game) => (game.hand?.complete ? GAME_STATES.HAND_RESULTS : GAME_STATES.BETTING),
  },
  [GAME_STATES.SHOWDOWN]: { next: GAME_STATES.HAND_RESULTS }, // alias — never parked in
  [GAME_STATES.HAND_RESULTS]: {
    next: (game, messages) =>
      gameOver(game)
        ? GAME_STATES.GAME_OVER
        : buildCompactionEvents(game, messages).length > 0
          ? GAME_STATES.COMPACTION
          : GAME_STATES.BETTING,
  },
  [GAME_STATES.COMPACTION]: {
    next: (game) => (game.gameQueue.length > 0 ? GAME_STATES.COMPACTION : GAME_STATES.BETTING),
  },
  [GAME_STATES.GAME_OVER]: { next: GAME_STATES.GAME_OVER },
};

export function nextState(game: Game, messages: GameMessage[] = []): GameState {
  const node = STATE_GRAPH[game.status];
  return typeof node.next === 'function' ? node.next(game, messages) : node.next;
}

export function gameOver(game: Game): boolean {
  return game.seats.filter((s) => s.status === 'active').length < 2;
}
