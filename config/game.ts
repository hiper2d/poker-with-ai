/** Table + tournament rules. Pure data — no logic. */
export const GAME_CONFIG = {
  minPlayers: 2,
  maxPlayers: 6,
  startingStack: 10_000,

  /** Sit-n-go blind schedule: level increases every `handsPerBlindLevel` hands. */
  handsPerBlindLevel: 8,
  blindLevels: [
    { smallBlind: 50, bigBlind: 100 },
    { smallBlind: 100, bigBlind: 200 },
    { smallBlind: 150, bigBlind: 300 },
    { smallBlind: 250, bigBlind: 500 },
    { smallBlind: 400, bigBlind: 800 },
    { smallBlind: 600, bigBlind: 1_200 },
    { smallBlind: 1_000, bigBlind: 2_000 },
  ],

  /** Chat compaction runs every X hands (when a bot has enough un-summarized chat). */
  compactionIntervalHands: 4,
  /** Un-summarized chat above this estimate forces chat compaction even off-interval. */
  chatCompactionTokenThreshold: 6_000,
  /** On-interval compaction is skipped below this — nothing worth summarizing. */
  chatCompactionMinTokens: 200,
  /** How many recent hand records the decision prompt includes verbatim. */
  handHistoryInPrompt: 8,
  /** system prompt + summaries above this triggers context compaction (summarize summaries). */
  contextCompactionTokenThreshold: 12_000,

  /** The Pit Boss picks this many bots to reply to a human message or a nudge. */
  chatRouterMinBots: 1,
  chatRouterMaxBots: 3,
  /** Reacting to a bot's own table talk: silence is a valid answer, so there is no minimum. */
  chatRouterMaxReactors: 2,

  /**
   * Chat spend guardrails. Betting decisions are inherently bounded (a hand needs N of
   * them), but conversation is not — so bot chat replies are capped per hand and per
   * game. Counted from the message log, not a stored counter. Once a cap is hit the Pit
   * Boss is not consulted either, so the routing call is saved along with the replies.
   */
  chatBudget: {
    free: { perHand: 6, perGame: 60 },
    default: { perHand: 12, perGame: 300 },
  },

  gameTtlDays: 30,
} as const;
