'use client';

/**
 * Mock game for the dev-only /dev/table preview (?theme=neon etc.). The hand waits on
 * the human, so GameRoom's pumps stop immediately and no server action ever fires.
 * Names/stacks deliberately include the longest realistic strings (model tags, five-digit
 * stacks, "raise 12,000" action lines) — this page exists to catch layout overflow.
 */
import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import GameRoom from '@/components/GameRoom';
import type { Game, GameMessage } from '@/models/game';
import type { HandState } from '@/lib/engine/types';

const NAMES = ['Paul', 'Chani', 'Stilgar', 'Jessica', 'Gurney', 'Feyd'] as const;
const MODELS = ['', 'gpt-5.6-terra', 'gemini-3.5-flash-lite', 'claude', 'gemini-flash', 'claude-opus'];

const hand: HandState = {
  handNumber: 3,
  street: 'flop',
  deck: [],
  board: ['9s', '3h', '7d'],
  players: NAMES.map((name, i) => ({
    name,
    holeCards: name === 'Paul' ? (['Qd', '3s'] as ['Qd', '3s']) : null,
    startingStack: 8300 + i * 3100,
    streetCommitted: [100, 0, 0, 900, 50, 900][i],
    totalCommitted: [400, 300, 300, 1200, 350, 1200][i],
    folded: i === 2 || i === 4,
    allIn: false,
  })),
  pots: [{ amount: 2750, eligible: [...NAMES] }],
  toAct: 'Paul',
  currentBet: 900,
  minRaise: 900,
  lastAggressor: 'Jessica',
  actionLog: [
    { player: 'Jessica', type: 'raise', amount: 12000, street: 'flop' },
    { player: 'Stilgar', type: 'fold', street: 'flop' },
    { player: 'Gurney', type: 'fold', street: 'flop' },
  ],
  acted: ['Jessica', 'Stilgar', 'Gurney'],
  complete: false,
  smallBlind: 50,
  bigBlind: 100,
};

const game: Game = {
  id: 'dev-preview',
  theme: 'Dune',
  scene: 'dev preview',
  status: 'BETTING',
  createdBy: 'dev@local',
  createdWithTier: 'paid',
  humanPlayerName: 'Paul',
  seats: NAMES.map((name, i) => ({
    seatIndex: i,
    name,
    isHuman: i === 0,
    stack: 8300 + i * 3100,
    status: 'active' as const,
  })),
  bots: NAMES.slice(1).map((name, i) => ({
    name,
    gender: 'unknown',
    story: '',
    personaId: 'dev',
    aiType: MODELS[i + 1],
    summaries: [],
    chatWatermark: 0,
    tokenUsage: { inputTokens: 12345, outputTokens: 2345, costUsd: 0.0456 },
  })),
  buttonSeat: 1,
  blindLevel: 0,
  handNumber: 3,
  hand,
  gameQueue: [],
  chatQueue: [],
  messageCounter: 10,
  handHistory: [],
  gameMasterAiType: 'gpt-5.6-luna',
  gameMasterTokenUsage: { inputTokens: 23456, outputTokens: 3456, costUsd: 0.0789 },
  totalGameCost: 0.31,
  createdAt: 0,
  expireAt: 0,
};

const messages: GameMessage[] = [
  {
    id: 'dev-1',
    recipientName: 'ALL',
    authorName: 'GM',
    msg: 'Feyd bets 900. The table holds its breath while the Harkonnen grins.',
    messageType: 'GAME_ACTION',
    handNumber: 3,
    timestamp: 1755000000000,
  },
];

export default function DevTable() {
  const params = useSearchParams();
  const theme = params.get('theme');
  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme;
  }, [theme]);
  return <GameRoom game={game} messages={messages} />;
}
