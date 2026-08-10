import { Hand } from 'pokersolver';
import type { Card } from './types';

export interface EvaluatedHand {
  name: string; // player name
  /** Human-readable rank, e.g. "Two Pair, A's & Q's" */
  description: string;
}

/**
 * Returns the winning player names among contenders (ties = split pot).
 * Thin wrapper around pokersolver so the rest of the engine never touches the lib directly.
 */
export function findWinners(
  contenders: { name: string; holeCards: [Card, Card] }[],
  board: Card[],
): { winners: string[]; evaluated: EvaluatedHand[] } {
  const solved = contenders.map((c) => ({
    name: c.name,
    hand: Hand.solve([...c.holeCards, ...board]),
  }));
  const winningHands = Hand.winners(solved.map((s) => s.hand));
  const winners = solved.filter((s) => winningHands.includes(s.hand)).map((s) => s.name);
  return {
    winners,
    evaluated: solved.map((s) => ({ name: s.name, description: s.hand.descr })),
  };
}
