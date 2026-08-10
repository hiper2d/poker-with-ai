import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '@/config/game';
import type { Seat } from '@/models/game';
import { blindLevelForHand, nextActiveButton } from './flow';

describe('blindLevelForHand', () => {
  it('steps up every handsPerBlindLevel hands and caps at the schedule end', () => {
    const per = GAME_CONFIG.handsPerBlindLevel;
    expect(blindLevelForHand(1)).toBe(0);
    expect(blindLevelForHand(per)).toBe(0);
    expect(blindLevelForHand(per + 1)).toBe(1);
    expect(blindLevelForHand(per * 3 + 1)).toBe(3);
    expect(blindLevelForHand(per * 100)).toBe(GAME_CONFIG.blindLevels.length - 1);
  });
});

describe('nextActiveButton', () => {
  const seats = (statuses: ('active' | 'eliminated')[]): Seat[] =>
    statuses.map((status, i) => ({
      seatIndex: i,
      name: `P${i}`,
      isHuman: i === 0,
      stack: status === 'active' ? 1000 : 0,
      status,
    }));

  it('rotates clockwise', () => {
    expect(nextActiveButton(seats(['active', 'active', 'active']), 0)).toBe(1);
    expect(nextActiveButton(seats(['active', 'active', 'active']), 2)).toBe(0);
  });

  it('skips eliminated seats', () => {
    expect(nextActiveButton(seats(['active', 'eliminated', 'active']), 0)).toBe(2);
    expect(nextActiveButton(seats(['active', 'eliminated', 'eliminated', 'active']), 3)).toBe(0);
  });

  it('wraps around past the end of the table', () => {
    expect(nextActiveButton(seats(['eliminated', 'active', 'active']), 2)).toBe(1);
  });
});
