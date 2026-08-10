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

export type ChatTrigger = 'router' | 'manual' | 'mention';

/** Chat events run on their own queue + pump and never block the game queue. */
export interface ChatEvent {
  actor: string;
  kind: 'CHAT_REPLY' | 'WELCOME_INTRO';
  trigger?: ChatTrigger;
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
}

// ---- Message system (werewolf-style recipient targeting) ----

export const RECIPIENT_ALL = 'ALL';

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

export interface GameErrorState {
  message: string;
  failedAction: string;
  timestamp: number;
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
  errorState?: GameErrorState | null;
  createdAt: number;
  expireAt: number; // sliding TTL
}
