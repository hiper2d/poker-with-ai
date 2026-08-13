import type { HandState } from '@/lib/engine/types';

export const GAME_STATES = {
  WELCOME: 'WELCOME',
  HAND_SETUP: 'HAND_SETUP',
  BETTING: 'BETTING',
  SHOWDOWN: 'SHOWDOWN',
  HAND_RESULTS: 'HAND_RESULTS',
  COMPACTION: 'COMPACTION',
  GAME_OVER: 'GAME_OVER',
} as const;

export type GameState = (typeof GAME_STATES)[keyof typeof GAME_STATES];

// ---- Queues: entries carry their meaning; never bare names ----

export type GameEventKind =
  | 'DECIDE_ACTION' // bot (or human) must act in the betting round
  | 'COMPACT_CHAT' // bot summarizes raw chat into a new summary entry
  | 'COMPACT_CONTEXT'; // bot collapses summaries S1..Sn into one

export interface GameEvent {
  actor: string; // player name; engine-only steps have no queue entry
  kind: GameEventKind;
}

export type ChatTrigger =
  | 'router' // the Pit Boss picked this speaker
  | 'manual' // the human picked this speaker directly
  | 'reaction' // the Pit Boss routed a reply to a bot's table talk
  | 'result'; // the hand just settled — winner gloats, loser vents

/** Chat events run on their own queue + pump and never block the game queue. */
export interface ChatEvent {
  actor: string;
  kind: 'CHAT_REPLY' | 'WELCOME_INTRO';
  trigger?: ChatTrigger;
  /** What this reply answers — lets the prompt say "answer Vex", not just "say something". */
  cause?: { author: string; text: string };
}

// ---- Players ----

export type SeatStatus = 'active' | 'eliminated';

export interface Seat {
  seatIndex: number;
  name: string; // names are the identifiers everywhere, like in werewolf
  isHuman: boolean;
  stack: number;
  status: SeatStatus;
  eliminatedInHand?: number;
}

export interface Bot {
  name: string;
  gender: string;
  story: string;
  personaId: string; // key into config/personas.ts
  aiType: string; // key into config/models.ts
  voice?: string;
  summaries: string[]; // S1..Sn, appended by compaction
  chatWatermark: number; // messageCounter bound; chat before it is compacted away
  tokenUsage?: TokenUsageTotals;
}

export interface TokenUsageTotals {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

// ---- Precise game records (never summarized) ----

export interface HandRecord {
  handNumber: number;
  winners: { name: string; amountWon: number; shownCards?: string[] }[];
  potSize: number;
  board: string[];
  /** compact engine-written line, e.g. "Vex raised pre, c-bet flop, Duchess folded river" */
  keyActions: string;
  eliminated: string[];
  /** Everyone who reached showdown and their cards — absent when the pot was folded to. */
  showdown?: { name: string; cards: string[] }[];
}

// ---- Message system (werewolf-style recipient targeting) ----

export const RECIPIENT_ALL = 'ALL';

/**
 * The chat router's identity: the floor supervisor who decides who gets a turn to talk.
 * Distinct from the dealer voice ('GM') that narrates hands, and from the dealer BUTTON
 * the engine rotates.
 */
export const PIT_BOSS = 'Pit Boss';

export type MessageType =
  | 'GM_COMMAND'
  | 'GAME_STORY'
  | 'BOT_ANSWER'
  | 'BOT_INTRO'
  | 'TABLE_TALK' // tableTalk attached to a betting action
  | 'GAME_ACTION' // engine-written action line ("Vex raises to 600")
  | 'HUMAN_PLAYER_MESSAGE'
  | 'HAND_RESULT'
  | 'COMPACTION' // "X files away what the table has shown" — memory events in the feed
  | 'GM_ROUTER_SELECTION' // hidden: router reasoning
  | 'SYSTEM_ERROR';

export interface GameMessage {
  id?: string; // `${counter:06d}-${author}-to-${recipient}`
  recipientName: string;
  authorName: string;
  msg: unknown; // string for human/GM, structured object for AI output
  messageType: MessageType;
  handNumber: number;
  timestamp: number;
  cost?: number;
}

// ---- The game doc ----

/**
 * The two independent lanes of work. Each has its own pump, its own queue, and its own
 * error slot: a bot failing to speak must not stop the cards, and a failed betting
 * decision must not silence the table.
 */
export type Lane = 'game' | 'chat';

/** Why the Pit Boss is being asked to route: what just happened that might draw replies. */
export type RoutingCauseKind = 'human' | 'reaction' | 'nudge';

export interface RoutingCause {
  kind: RoutingCauseKind;
  /** Who spoke, for 'human' and 'reaction'. */
  author?: string;
  text?: string;
}

/**
 * A failed step, kept on its lane until a retry succeeds. It stops that lane's pump, drives
 * the lane's error banner, and rides back into the next attempt's prompt (`retryNote`) so
 * the model is told what went wrong instead of blindly repeating the same call.
 */
export interface GameErrorState {
  /** Shown to the player, in plain language. */
  message: string;
  /** Technical cause — surfaced in the prompt on retry and in logs, not in the banner. */
  details: string;
  failedAction: string;
  /** Whose call failed: a bot name, or PIT_BOSS. */
  actor?: string;
  /** The model that failed, for the banner and for offering a different one. */
  model?: string;
  /**
   * Whether there is still a pending step to replay. False when the failure left nothing
   * queued — a routing call decides *who* speaks, so when it fails there is no bot to try
   * again. The player recovers by saying something else or nudging the table instead, and
   * the banner offers no Retry.
   */
  retryable: boolean;
  timestamp: number;
}

/**
 * What Retry leaves behind for the next attempt. Set when the player clears a lane's
 * error, consumed by the next call in that lane: the hint is appended to the prompt so the
 * model is told why the last attempt failed, and `model` (from "Retry with another model")
 * substitutes for exactly one call without changing the character's real model.
 */
export interface RetryPlan {
  /** Whose call failed — the hint and model apply to this player only. */
  actor: string;
  /**
   * Why the previous attempt failed. Only set for response-format failures — a timeout or 5xx
   * has nothing to tell the model — and never together with `model`: a different model has not
   * made the mistake being described.
   */
  hint?: string;
  model?: string;
}

export interface Game {
  id: string;
  theme: string;
  scene: string; // why these characters sat down at this table
  status: GameState;
  createdBy: string; // user email
  createdWithTier: string;
  humanPlayerName: string;
  seats: Seat[];
  bots: Bot[];
  buttonSeat: number;
  blindLevel: number;
  handNumber: number;
  hand: HandState | null; // engine-owned; null between hands
  gameQueue: GameEvent[];
  chatQueue: ChatEvent[];
  messageCounter: number;
  handHistory: HandRecord[];
  gameMasterAiType: string;
  /** GM-model usage (dealer narration + Pit Boss routing), accumulated by cost tracking. */
  gameMasterTokenUsage?: TokenUsageTotals;
  /** Model cost (pre-markup) of every AI call this game has made, in USD. */
  totalGameCost?: number;
  /** Per-lane retry state. A set error stops that lane's pump until the player retries. */
  gameError?: GameErrorState | null;
  chatError?: GameErrorState | null;
  gameRetry?: RetryPlan | null;
  chatRetry?: RetryPlan | null;
  createdAt: number;
  expireAt: number; // sliding TTL
}
