import { describe, expect, it } from 'vitest';
import type { Seat } from '@/models/game';
import { applyAction, legalActions, livePlayers, settleHand, startHand } from './betting';
import { freshDeck, shuffle } from './deck';
import { findWinners } from './evaluate';
import { buildPots } from './pots';
import type { HandState } from './types';

const mkSeats = (stacks: number[]): Seat[] =>
  stacks.map((stack, i) => ({
    seatIndex: i,
    name: ['Alice', 'Bob', 'Cara', 'Dan'][i],
    isHuman: i === 0,
    stack,
    status: 'active' as const,
  }));

function playStreet(hand: HandState) {
  while (!hand.complete && hand.toAct) {
    const street = hand.street;
    const legal = legalActions(hand);
    applyAction(hand, { player: hand.toAct, type: legal.actions.includes('check') ? 'check' : 'call' });
    if (hand.street !== street) break;
  }
}

describe('deck', () => {
  it('has 52 unique cards and shuffling preserves them', () => {
    const deck = freshDeck();
    expect(new Set(deck).size).toBe(52);
    expect(new Set(shuffle(deck)).size).toBe(52);
  });
});

describe('startHand', () => {
  it('deals 2 cards each, posts blinds, sets first actor', () => {
    const hand = startHand(mkSeats([10_000, 10_000, 10_000]), 0, 1, 50, 100);
    expect(hand.players).toHaveLength(3);
    expect(hand.deck).toHaveLength(52 - 6);
    expect(hand.currentBet).toBe(100);
    expect(hand.players.map((p) => p.totalCommitted).sort((a, b) => a - b)).toEqual([0, 50, 100]);
    expect(hand.toAct).not.toBeNull();
  });

  it('heads-up: button posts SB and acts first preflop', () => {
    const hand = startHand(mkSeats([1_000, 1_000]), 0, 1, 50, 100);
    // seat 0 (Alice) is button → SB → acts first
    expect(hand.toAct).toBe('Alice');
    const alice = hand.players.find((p) => p.name === 'Alice')!;
    expect(alice.totalCommitted).toBe(50);
  });
});

describe('betting round', () => {
  it('closes preflop and deals a flop after calls, BB gets the option', () => {
    const hand = startHand(mkSeats([10_000, 10_000, 10_000]), 0, 1, 50, 100);
    playStreet(hand);
    expect(hand.street).toBe('flop');
    expect(hand.board).toHaveLength(3);
    expect(hand.currentBet).toBe(0);
  });

  it('a raise reopens action', () => {
    const hand = startHand(mkSeats([10_000, 10_000, 10_000]), 0, 1, 50, 100);
    const first = hand.toAct!;
    applyAction(hand, { player: first, type: 'raise', amount: 300 });
    expect(hand.currentBet).toBe(300);
    expect(hand.minRaise).toBe(200);
    // everyone else still owes action
    expect(hand.toAct).not.toBeNull();
    expect(hand.toAct).not.toBe(first);
  });

  it('all-in for less than min-raise does not reopen action', () => {
    // Cara is short: raise-to amounts get clamped to her stack
    const seats = mkSeats([10_000, 10_000, 350]);
    const hand = startHand(seats, 0, 1, 50, 100);
    // order after button(0): Bob(SB), Cara(BB), Alice first to act
    expect(hand.toAct).toBe('Alice');
    applyAction(hand, { player: 'Alice', type: 'raise', amount: 300 }); // full raise
    applyAction(hand, { player: 'Bob', type: 'call' });
    // Cara all-in to 350 — only +50 over 300, below minRaise 200 → no reopen
    applyAction(hand, { player: 'Cara', type: 'raise', amount: 350 });
    expect(hand.minRaise).toBe(200);
    // Alice and Bob owe only the 50 call
    const legal = legalActions(hand);
    expect(legal.callAmount).toBe(50);
  });

  it('folds end the hand uncontested', () => {
    const hand = startHand(mkSeats([10_000, 10_000, 10_000]), 0, 1, 50, 100);
    applyAction(hand, { player: hand.toAct!, type: 'fold' });
    applyAction(hand, { player: hand.toAct!, type: 'fold' });
    expect(hand.complete).toBe(true);
    expect(livePlayers(hand)).toHaveLength(1);
  });

  it('runs the board out when everyone is all-in', () => {
    const hand = startHand(mkSeats([500, 500]), 0, 1, 50, 100);
    applyAction(hand, { player: hand.toAct!, type: 'raise', amount: 500 });
    applyAction(hand, { player: hand.toAct!, type: 'call' });
    expect(hand.complete).toBe(true);
    expect(hand.board).toHaveLength(5);
  });
});

describe('street progression', () => {
  it('a checked-down hand visits flop, turn, river and completes at showdown', () => {
    const hand = startHand(mkSeats([10_000, 10_000, 10_000]), 0, 1, 50, 100);
    expect(hand.street).toBe('preflop');
    playStreet(hand);
    expect(hand.street).toBe('flop');
    expect(hand.board).toHaveLength(3);
    playStreet(hand);
    expect(hand.street).toBe('turn');
    expect(hand.board).toHaveLength(4);
    playStreet(hand);
    expect(hand.street).toBe('river');
    expect(hand.board).toHaveLength(5);
    playStreet(hand);
    expect(hand.complete).toBe(true);
    expect(hand.toAct).toBeNull();
  });
});

describe('settleHand', () => {
  it('uncontested pot returns uncalled excess to the aggressor', () => {
    const hand = startHand(mkSeats([10_000, 10_000, 10_000]), 0, 1, 50, 100);
    const first = hand.toAct!;
    applyAction(hand, { player: first, type: 'raise', amount: 500 });
    applyAction(hand, { player: hand.toAct!, type: 'fold' });
    applyAction(hand, { player: hand.toAct!, type: 'fold' });
    const result = settleHand(hand);
    // winner takes blinds (150) and their own 500 back
    expect(result.winners).toHaveLength(1);
    expect(result.winners[0].name).toBe(first);
    expect(result.stackDeltas[first]).toBe(150);
    expect(Object.values(result.stackDeltas).reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('chips are conserved at showdown', () => {
    const hand = startHand(mkSeats([1_000, 1_000, 1_000]), 0, 1, 50, 100);
    while (!hand.complete) playStreet(hand);
    const result = settleHand(hand);
    expect(Object.values(result.stackDeltas).reduce((a, b) => a + b, 0)).toBe(0);
    expect(result.winners.length).toBeGreaterThan(0);
    expect(result.winners[0].shownCards).toBeDefined();
  });
});

describe('pots', () => {
  it('builds layered side pots from unequal commitments', () => {
    const base = { streetCommitted: 0, folded: false, startingStack: 1000 };
    const pots = buildPots([
      { ...base, name: 'A', holeCards: ['Ah', 'Kh'], totalCommitted: 100, allIn: true },
      { ...base, name: 'B', holeCards: ['2c', '3d'], totalCommitted: 300, allIn: false },
      { ...base, name: 'C', holeCards: ['7s', '8s'], totalCommitted: 300, allIn: false },
    ]);
    expect(pots).toHaveLength(2);
    expect(pots[0]).toEqual({ amount: 300, eligible: ['A', 'B', 'C'] });
    expect(pots[1]).toEqual({ amount: 400, eligible: ['B', 'C'] });
  });
});

describe('evaluate', () => {
  it('picks the better hand at showdown', () => {
    const { winners } = findWinners(
      [
        { name: 'A', holeCards: ['Ah', 'Ad'] },
        { name: 'B', holeCards: ['Kh', 'Kd'] },
      ],
      ['2c', '7s', '9h', 'Jd', '3c'],
    );
    expect(winners).toEqual(['A']);
  });
});
