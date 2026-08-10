// Live smoke test: simulate one full hand with real LLM decisions, no Firestore.
// Usage: npx tsx --env-file=.env scripts/test-hand-sim.ts [model1,model2,model3]
import { ENV_KEY_FALLBACKS, type ApiKeyMap, type ApiKeyName } from '@/config/models';
import { decideBotAction } from '@/lib/ai/bot-player';
import { applyAction, settleHand, startHand } from '@/lib/engine/betting';
import type { Game } from '@/models/game';
import { GAME_STATES } from '@/models/game';

const models = (process.argv[2] ?? 'claude,deepseek,gemini').split(',');
const apiKeys: ApiKeyMap = {};
for (const [keyName, envVar] of Object.entries(ENV_KEY_FALLBACKS)) {
  if (process.env[envVar]) apiKeys[keyName as ApiKeyName] = process.env[envVar];
}

const names = ['Vesper', 'Le Chiffre', 'Felix'];
const seats = names.map((name, i) => ({
  seatIndex: i,
  name,
  isHuman: false,
  stack: 10_000,
  status: 'active' as const,
}));

const game: Game = {
  id: 'sim',
  theme: 'Casino Royale',
  scene: 'A private high-stakes game in Montenegro. Everyone at this table has something to lose.',
  status: GAME_STATES.BETTING,
  createdBy: 'sim@test',
  createdWithTier: 'api',
  humanPlayerName: '__none__',
  seats,
  bots: names.map((name, i) => ({
    name,
    gender: 'unknown',
    story: `You are ${name}, a professional gambler with a hidden agenda.`,
    personaId: ['shark', 'trapper', 'maniac'][i],
    aiType: models[i % models.length],
    summaries: [],
    chatWatermark: 0,
  })),
  buttonSeat: 0,
  blindLevel: 0,
  handNumber: 1,
  hand: startHand(seats, 0, 1, 50, 100),
  gameQueue: [],
  chatQueue: [],
  messageCounter: 0,
  handHistory: [],
  gameMasterAiType: 'claude',
  createdAt: 0,
  expireAt: 0,
};

async function main() {
  const hand = game.hand!;
  let steps = 0;
  while (!hand.complete && steps++ < 30) {
    const bot = game.bots.find((b) => b.name === hand.toAct)!;
    const turn = await decideBotAction(game, bot, [], apiKeys);
    applyAction(hand, turn.action);
    console.log(
      `[${hand.street}] ${bot.name} (${bot.aiType}): ${turn.action.type}${turn.action.amount ? ' to ' + turn.action.amount : ''}` +
        (turn.tableTalk ? `  💬 "${turn.tableTalk}"` : ''),
    );
  }
  const result = settleHand(hand);
  console.log('board:', hand.board.join(' '));
  for (const w of result.winners) {
    console.log(`WINNER: ${w.name} +${w.amountWon}${w.hand ? ` (${w.hand})` : ''}`);
  }
  const conservation = Object.values(result.stackDeltas).reduce((a, b) => a + b, 0);
  console.log('chip conservation check:', conservation === 0 ? 'OK' : `BROKEN (${conservation})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
