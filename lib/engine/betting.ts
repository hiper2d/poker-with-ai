import type { Seat } from '@/models/game';
import { draw, freshDeck, shuffle } from './deck';
import { buildPots } from './pots';
import { findWinners } from './evaluate';
import type {
  ActionType,
  BettingAction,
  Card,
  HandResult,
  HandState,
  PlayerHandState,
  Street,
} from './types';

const STREET_ORDER: Street[] = ['preflop', 'flop', 'turn', 'river'];

export interface LegalActions {
  actions: ActionType[];
  /** Extra chips needed to call (already stack-capped). */
  callAmount: number;
  /** Minimum legal total to raise TO. */
  minRaiseTo: number;
  /** Maximum total to raise TO (all-in). */
  maxRaiseTo: number;
}

/** Deal a new hand: post blinds, deal hole cards, set preflop action. */
export function startHand(
  seats: Seat[],
  buttonSeat: number,
  handNumber: number,
  smallBlind: number,
  bigBlind: number,
): HandState {
  const active = seatsInOrder(seats, buttonSeat).filter((s) => s.status === 'active');
  if (active.length < 2) throw new Error('Need at least 2 active players');

  let deck = shuffle(freshDeck());
  const players: PlayerHandState[] = active.map((seat) => {
    const { drawn, rest } = draw(deck, 2);
    deck = rest;
    return {
      name: seat.name,
      holeCards: drawn as [Card, Card],
      startingStack: seat.stack,
      streetCommitted: 0,
      totalCommitted: 0,
      folded: false,
      allIn: false,
    };
  });

  const hand: HandState = {
    handNumber,
    street: 'preflop',
    deck,
    board: [],
    players,
    pots: [],
    toAct: null,
    currentBet: 0,
    minRaise: bigBlind,
    lastAggressor: null,
    actionLog: [],
    acted: [],
    complete: false,
    smallBlind,
    bigBlind,
  };

  // seatsInOrder starts left of the button and ends with the button.
  // Heads-up: the button posts SB and acts first preflop.
  const headsUp = players.length === 2;
  const sb = headsUp ? players[1] : players[0];
  const bb = headsUp ? players[0] : players[1];
  commit(sb, smallBlind);
  commit(bb, bigBlind);
  hand.currentBet = bigBlind;
  const firstIdx = headsUp ? 1 : 2 % players.length;
  hand.toAct = nextEligibleFrom(hand, firstIdx);
  if (hand.toAct === null) finishBetting(hand); // everyone forced all-in by blinds
  return hand;
}

export function legalActions(hand: HandState): LegalActions {
  const p = mustGet(hand, hand.toAct);
  const stack = remainingStack(p);
  const callAmount = Math.min(hand.currentBet - p.streetCommitted, stack);
  const actions: ActionType[] = ['fold'];
  actions.push(callAmount === 0 ? 'check' : 'call');
  const maxRaiseTo = p.streetCommitted + stack;
  const canRaise = maxRaiseTo > hand.currentBet && !hand.players.every((q) => q === p || q.folded || q.allIn);
  if (canRaise) actions.push(hand.currentBet === 0 ? 'bet' : 'raise');
  return {
    actions,
    callAmount,
    minRaiseTo: Math.min(hand.currentBet + hand.minRaise, maxRaiseTo),
    maxRaiseTo,
  };
}

/**
 * Apply an action for hand.toAct and advance the hand. Mutates and returns `hand`
 * (persistence happens at the server-action layer). Throws on illegal actions —
 * callers pre-validate with legalActions (bot output goes through coercion first).
 */
export function applyAction(hand: HandState, action: BettingAction): HandState {
  if (hand.complete) throw new Error('Hand is complete');
  if (action.player !== hand.toAct) throw new Error(`Not ${action.player}'s turn`);
  const p = mustGet(hand, action.player);
  const legal = legalActions(hand);
  if (!legal.actions.includes(action.type)) {
    throw new Error(`Illegal action ${action.type}; legal: ${legal.actions.join(',')}`);
  }

  switch (action.type) {
    case 'fold':
      p.folded = true;
      break;
    case 'check':
      break;
    case 'call':
      commit(p, legal.callAmount);
      break;
    case 'bet':
    case 'raise': {
      const raiseTo = Math.min(Math.max(action.amount ?? 0, legal.minRaiseTo), legal.maxRaiseTo);
      const increment = raiseTo - hand.currentBet;
      commit(p, raiseTo - p.streetCommitted);
      hand.currentBet = raiseTo;
      if (increment >= hand.minRaise) {
        // full raise reopens action for everyone else
        hand.minRaise = increment;
        hand.lastAggressor = p.name;
        hand.acted = [];
      }
      // else: short all-in — others owe the call but action is not reopened
      action.amount = raiseTo;
      break;
    }
  }
  if (!hand.acted.includes(p.name)) hand.acted.push(p.name);
  hand.actionLog.push({ ...action, street: hand.street });

  if (livePlayers(hand).length < 2) {
    finishBetting(hand);
    return hand;
  }
  const idx = hand.players.findIndex((q) => q.name === p.name);
  hand.toAct = nextEligibleFrom(hand, idx + 1);
  if (hand.toAct === null) endStreet(hand);
  return hand;
}

export function livePlayers(hand: HandState): PlayerHandState[] {
  return hand.players.filter((p) => !p.folded);
}

/** Settle a completed hand: winners per pot, stack deltas, shown cards. */
export function settleHand(hand: HandState): HandResult {
  if (!hand.complete) throw new Error('Hand not complete');
  const pots = buildPots(hand.players);
  const live = livePlayers(hand);
  const showdown = live.length > 1;
  const winnings: Record<string, number> = {};

  for (const pot of pots) {
    const contenders = live.filter((p) => pot.eligible.includes(p.name));
    let potWinners: string[];
    if (contenders.length === 0) continue; // defensive; folded-only layer cannot happen
    if (contenders.length === 1) {
      potWinners = [contenders[0].name];
    } else {
      potWinners = findWinners(
        contenders.map((c) => ({ name: c.name, holeCards: c.holeCards! })),
        hand.board,
      ).winners;
    }
    const share = Math.floor(pot.amount / potWinners.length);
    let remainder = pot.amount - share * potWinners.length;
    for (const w of potWinners) {
      winnings[w] = (winnings[w] ?? 0) + share + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder--;
    }
  }

  const evaluated = showdown
    ? findWinners(
        live.map((c) => ({ name: c.name, holeCards: c.holeCards! })),
        hand.board,
      ).evaluated
    : [];

  return {
    winners: Object.entries(winnings)
      .filter(([, amount]) => amount > 0)
      .map(([name, amountWon]) => ({
        name,
        amountWon,
        hand: evaluated.find((e) => e.name === name)?.description,
        shownCards: showdown ? (live.find((p) => p.name === name)?.holeCards ?? undefined) : undefined,
      })),
    stackDeltas: Object.fromEntries(
      hand.players.map((p) => [p.name, (winnings[p.name] ?? 0) - p.totalCommitted]),
    ),
  };
}

// ---- internals ----

function seatsInOrder(seats: Seat[], buttonSeat: number): Seat[] {
  const sorted = [...seats].sort((a, b) => a.seatIndex - b.seatIndex);
  const idx = sorted.findIndex((s) => s.seatIndex === buttonSeat);
  return [...sorted.slice(idx + 1), ...sorted.slice(0, idx + 1)];
}

function commit(p: PlayerHandState, amount: number) {
  const paid = Math.min(amount, remainingStack(p));
  p.streetCommitted += paid;
  p.totalCommitted += paid;
  if (remainingStack(p) === 0) p.allIn = true;
}

function remainingStack(p: PlayerHandState): number {
  return p.startingStack - p.totalCommitted;
}

function mustGet(hand: HandState, name: string | null): PlayerHandState {
  const p = hand.players.find((x) => x.name === name);
  if (!p) throw new Error(`Unknown player ${name}`);
  return p;
}

/** Next player from index (wrapping) who still owes action; null when the street is closed. */
function nextEligibleFrom(hand: HandState, startIdx: number): string | null {
  const n = hand.players.length;
  for (let i = 0; i < n; i++) {
    const p = hand.players[(startIdx + i) % n];
    if (p.folded || p.allIn) continue;
    if (p.streetCommitted < hand.currentBet) return p.name;
    if (!hand.acted.includes(p.name)) return p.name;
  }
  return null;
}

function endStreet(hand: HandState) {
  hand.pots = buildPots(hand.players);
  const live = livePlayers(hand);

  if (live.length < 2 || hand.street === 'river') {
    finishBetting(hand);
    return;
  }

  // fewer than 2 live players can still bet → run the board out to the river
  const canStillBet = live.filter((p) => !p.allIn);
  if (canStillBet.length < 2) {
    while ((hand.street as Street) !== 'river') dealNextStreet(hand);
    finishBetting(hand);
    return;
  }

  dealNextStreet(hand);
  for (const p of hand.players) p.streetCommitted = 0;
  hand.currentBet = 0;
  hand.minRaise = hand.bigBlind;
  hand.lastAggressor = null;
  hand.acted = [];
  hand.toAct = nextEligibleFrom(hand, 0);
  if (hand.toAct === null) endStreet(hand); // defensive: everyone all-in
}

function dealNextStreet(hand: HandState) {
  const next = STREET_ORDER[STREET_ORDER.indexOf(hand.street) + 1];
  hand.street = next;
  const { drawn, rest } = draw(hand.deck, next === 'flop' ? 3 : 1);
  hand.board.push(...drawn);
  hand.deck = rest;
}

function finishBetting(hand: HandState) {
  hand.pots = buildPots(hand.players);
  hand.toAct = null;
  hand.complete = true;
}
