/**
 * Pure tournament-flow helpers used by the game pump — no IO, fully testable.
 */
import { GAME_CONFIG } from '@/config/game';
import type { Seat } from '@/models/game';

/** Blind level for a 1-based hand number, capped at the last scheduled level. */
export function blindLevelForHand(handNumber: number): number {
  return Math.min(
    Math.floor((handNumber - 1) / GAME_CONFIG.handsPerBlindLevel),
    GAME_CONFIG.blindLevels.length - 1,
  );
}

/** Next active seat clockwise from the current button (naive rotation — dead-blind rules TODO). */
export function nextActiveButton(seats: Seat[], buttonSeat: number): number {
  const sorted = [...seats].sort((a, b) => a.seatIndex - b.seatIndex);
  const start = sorted.findIndex((s) => s.seatIndex === buttonSeat);
  for (let i = 1; i <= sorted.length; i++) {
    const seat = sorted[(start + i) % sorted.length];
    if (seat.status === 'active') return seat.seatIndex;
  }
  return buttonSeat;
}
