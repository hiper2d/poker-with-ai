import type { Game } from '@/models/game';

/**
 * Client-safe copy of the game doc: no deck, no other players' hole cards, no bot
 * memory (summaries hold each bot's private reads — including reads on the human).
 * Shown-down cards reach the client through HAND_RESULT messages / handHistory instead.
 */
export function sanitizeGame(game: Game): Game {
  const safe: Game = {
    ...game,
    bots: game.bots.map((b) => ({ ...b, summaries: [] })),
  };
  if (!game.hand) return safe;
  return {
    ...safe,
    hand: {
      ...game.hand,
      deck: [],
      players: game.hand.players.map((p) => ({
        ...p,
        holeCards: game.seats.find((s) => s.name === p.name)?.isHuman ? p.holeCards : null,
      })),
    },
  };
}
