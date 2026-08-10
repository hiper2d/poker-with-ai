// Pure poker engine types. This package must stay free of Firestore, Next.js and LLM imports.

export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
export type Suit = 'h' | 'd' | 'c' | 's';

/** Two-char card code, e.g. "Ah", "Td" — the format pokersolver consumes. */
export type Card = `${Rank}${Suit}`;

export type Street = 'preflop' | 'flop' | 'turn' | 'river';

export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise';

export interface BettingAction {
  player: string;
  type: ActionType;
  /** Total chips put in by this action (for bet/raise: the amount raised TO). */
  amount?: number;
  /** Street the action happened on (stamped by the engine). */
  street?: Street;
}

export interface PlayerHandState {
  name: string;
  /** null only in client-sanitized copies of other players' states. */
  holeCards: [Card, Card] | null;
  /** Seat stack at the moment the hand started. */
  startingStack: number;
  /** Chips committed on the current street. */
  streetCommitted: number;
  /** Chips committed across the whole hand (side-pot math). */
  totalCommitted: number;
  folded: boolean;
  allIn: boolean;
}

export interface Pot {
  amount: number;
  /** Players eligible to win this pot (side-pot layering). */
  eligible: string[];
}

export interface HandState {
  handNumber: number;
  street: Street;
  /** Remaining deck. Server-only secret — Firestore is never client-readable. */
  deck: Card[];
  board: Card[];
  players: PlayerHandState[];
  pots: Pot[];
  /** Name of the player who must act next; null when the street is closed. */
  toAct: string | null;
  /** Highest total street commitment to match. */
  currentBet: number;
  /** Minimum legal raise increment. */
  minRaise: number;
  /** Last player who bet/raised this street; street closes when action returns to them. */
  lastAggressor: string | null;
  /** Ordered log of every action this hand — injected verbatim into bot context. */
  actionLog: BettingAction[];
  /** Players who have voluntarily acted this street (big-blind option tracking). */
  acted: string[];
  /** True once betting is finished (showdown or uncontested) — settle next. */
  complete: boolean;
  smallBlind: number;
  bigBlind: number;
}

export interface HandResult {
  winners: { name: string; amountWon: number; hand?: string; shownCards?: Card[] }[];
  /** Stack deltas to apply to seats. */
  stackDeltas: Record<string, number>;
}
