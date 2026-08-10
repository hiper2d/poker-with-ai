import type { PlayerHandState, Pot } from './types';

/**
 * Layered side-pot construction from total commitments.
 * Folded players' chips stay in the pots they contributed to but they are never eligible.
 */
export function buildPots(players: PlayerHandState[]): Pot[] {
  const levels = [
    ...new Set(players.filter((p) => p.totalCommitted > 0).map((p) => p.totalCommitted)),
  ].sort((a, b) => a - b);

  const pots: Pot[] = [];
  let prevLevel = 0;
  for (const level of levels) {
    const slice = level - prevLevel;
    let amount = 0;
    const eligible: string[] = [];
    for (const p of players) {
      amount += Math.min(Math.max(p.totalCommitted - prevLevel, 0), slice);
      if (!p.folded && p.totalCommitted >= level) eligible.push(p.name);
    }
    if (amount > 0) {
      // merge with previous pot when eligibility is identical (avoids cosmetic splits)
      const prev = pots[pots.length - 1];
      if (prev && prev.eligible.length === eligible.length && prev.eligible.every((n) => eligible.includes(n))) {
        prev.amount += amount;
      } else {
        pots.push({ amount, eligible });
      }
    }
    prevLevel = level;
  }
  return pots;
}
