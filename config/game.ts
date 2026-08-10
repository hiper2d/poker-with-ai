/** Table + tournament rules. Pure data — no logic. */
export const GAME_CONFIG = {
  minPlayers: 2,
  maxPlayers: 8,
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

  /** Router picks this many bots to reply to a human chat message. */
  chatRouterMinBots: 1,
  chatRouterMaxBots: 3,

  gameTtlDays: 30,
} as const;
