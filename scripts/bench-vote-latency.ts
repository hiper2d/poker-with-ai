// Benchmark: wall-clock latency of one betting-decision ("vote") call, thinking off vs on.
// Rebuilds the ~36k-char JSON-vote test shape from the dev.to discussion using this app's
// real prompt builders, padded with synthetic hand-history recaps to reach the target size.
//
// Usage: npx tsx --env-file=.env scripts/bench-vote-latency.ts [models] [chars] [trials]
//   e.g. npx tsx --env-file=.env scripts/bench-vote-latency.ts claude,kimi,qwen,deepseek 36000 3
//
// Thinking knobs per vendor (from provider docs, 2026-08):
//   claude   sonnet-5:    thinking {type:'disabled'} vs {type:'adaptive'} (no fixed budget exists;
//                         adaptive = model decides depth, and is also the default when omitted)
//   gpt      5.6-terra:   reasoning_effort 'none' vs 'high'
//   deepseek v4-pro:      body {thinking:{type:'disabled'|'enabled'}} (default: enabled/high)
//   kimi     k3:          reasoning cannot be disabled — reasoning_effort 'low' vs 'max' (default max)
//   qwen     3.8-max:     body {enable_thinking:false|true} (effort defaults to xhigh when on)
//   gemini   3.1-pro:     thinkingConfig {thinkingBudget: 0} vs {thinkingBudget: -1} (dynamic)
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { ENV_KEY_FALLBACKS, getModelConfig, type ApiKeyMap, type ApiKeyName } from '@/config/models';
import { buildBotSystemPrompt, buildDecisionPrompt } from '@/lib/ai/prompts/bot-prompts';
import type { LegalActions } from '@/lib/engine/betting';
import type { HandState } from '@/lib/engine/types';
import type { Game, GameMessage } from '@/models/game';
import { GAME_STATES } from '@/models/game';

const modelIds = (process.argv[2] ?? 'claude,kimi,qwen,deepseek').split(',');
const targetChars = Number(process.argv[3] ?? 36_000);
const trials = Number(process.argv[4] ?? 3);

const apiKeys: ApiKeyMap = {};
for (const [keyName, envVar] of Object.entries(ENV_KEY_FALLBACKS)) {
  if (process.env[envVar]) apiKeys[keyName as ApiKeyName] = process.env[envVar];
}

// ---- Deterministic state so every run benchmarks the exact same prompt ----

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

const names = ['Vesper', 'Le Chiffre', 'Felix', 'Mathis', 'Valenka', 'Kratt'];

const hand: HandState = {
  handNumber: 27,
  street: 'river',
  deck: [],
  board: ['Ah', 'Td', '7c', '2s', 'Kd'],
  players: names.map((name, i) => ({
    name,
    holeCards: name === 'Vesper' ? (['As', 'Kc'] as ['As', 'Kc']) : null,
    startingStack: [14_200, 22_800, 9_400, 6_100, 11_500, 8_000][i],
    streetCommitted: [1_200, 3_600, 0, 0, 0, 0][i],
    totalCommitted: [4_400, 6_800, 2_000, 800, 800, 0][i],
    folded: i >= 2,
    allIn: false,
  })),
  pots: [],
  toAct: 'Vesper',
  currentBet: 3_600,
  minRaise: 2_400,
  lastAggressor: 'Le Chiffre',
  actionLog: [
    { street: 'preflop', player: 'Kratt', type: 'fold' },
    { street: 'preflop', player: 'Vesper', type: 'raise', amount: 800 },
    { street: 'preflop', player: 'Le Chiffre', type: 'call', amount: 800 },
    { street: 'preflop', player: 'Felix', type: 'call', amount: 800 },
    { street: 'preflop', player: 'Mathis', type: 'call', amount: 800 },
    { street: 'preflop', player: 'Valenka', type: 'call', amount: 800 },
    { street: 'flop', player: 'Valenka', type: 'check' },
    { street: 'flop', player: 'Vesper', type: 'bet', amount: 1_200 },
    { street: 'flop', player: 'Le Chiffre', type: 'call', amount: 1_200 },
    { street: 'flop', player: 'Felix', type: 'call', amount: 1_200 },
    { street: 'flop', player: 'Mathis', type: 'fold' },
    { street: 'flop', player: 'Valenka', type: 'fold' },
    { street: 'turn', player: 'Vesper', type: 'bet', amount: 2_000 },
    { street: 'turn', player: 'Le Chiffre', type: 'raise', amount: 4_800 },
    { street: 'turn', player: 'Felix', type: 'fold' },
    { street: 'turn', player: 'Vesper', type: 'call', amount: 4_800 },
    { street: 'river', player: 'Vesper', type: 'bet', amount: 1_200 },
    { street: 'river', player: 'Le Chiffre', type: 'raise', amount: 3_600 },
  ],
  acted: [],
  complete: false,
  smallBlind: 200,
  bigBlind: 400,
};

const legal: LegalActions = { actions: ['fold', 'call', 'raise'], callAmount: 2_400, minRaiseTo: 6_000, maxRaiseTo: 9_800 };

const game: Game = {
  id: 'bench',
  theme: 'Casino Royale',
  scene:
    'A private high-stakes sit-n-go in a Montenegro casino salon. Six strangers, each bankrolled by someone who expects results. The tournament is deep in the money bubble and every pot changes who survives.',
  status: GAME_STATES.BETTING,
  createdBy: 'bench@test',
  createdWithTier: 'api',
  humanPlayerName: '__none__',
  seats: names.map((name, i) => ({ seatIndex: i, name, isHuman: false, stack: 10_000, status: 'active' as const })),
  bots: names.map((name, i) => ({
    name,
    gender: 'unknown',
    story: `You are ${name}, a professional gambler with a hidden agenda and a debt you do not talk about. You have played twenty-six hands tonight and you remember every showdown.`,
    personaId: ['shark', 'trapper', 'maniac', 'shark', 'trapper', 'maniac'][i],
    aiType: 'claude',
    summaries: [],
    chatWatermark: 0,
  })),
  buttonSeat: 0,
  blindLevel: 3,
  handNumber: 27,
  hand,
  gameQueue: [],
  chatQueue: [],
  messageCounter: 0,
  handHistory: [],
  gameMasterAiType: 'claude',
  createdAt: 0,
  expireAt: 0,
};

const chatLines = [
  'That turn raise felt rehearsed. You practice that in the mirror, or does it come naturally with the suit?',
  'Twenty-six hands and I have not seen Vesper show down a bluff once. Draw your own conclusions, gentlemen.',
  'The blinds go up in two hands. Somebody at this table is about to get desperate, and it is not me.',
  'I called a man once who smiled exactly like that. He had queens. I had the rest of his evening.',
  'Small river bet into a raiser. Either the nuts begging for action or a very cheap question. Which is it?',
  'Felix folds too easily on turns. Someone should charge him rent for the flops he keeps visiting.',
  'I do not chase flushes after midnight. Superstition, maybe, but my stack agrees with me.',
  'You keep counting my chips, Le Chiffre. Count your own. There were more of them an hour ago.',
  'Kings on the river. Somewhere a man with ace-king just started breathing again.',
  'Talk is free. Calls cost twenty-four hundred. I notice who spends which currency.',
  'The last time this table saw a river raise, Valenka lost a stack and her patience. Memory is a weapon.',
  'Make it interesting or make it quick. The cards do not care about your theater.',
];
const recentChat: GameMessage[] = chatLines.map((msg, i) => ({
  recipientName: 'ALL',
  authorName: names[i % names.length],
  msg,
  messageType: 'TABLE_TALK',
  handNumber: 27,
  timestamp: i,
}));

// ---- Pad with synthetic prior-hand recaps until the total hits targetChars ----

function priorHandRecap(n: number): string {
  const hero = pick(names);
  const villain = pick(names.filter((x) => x !== hero));
  const streets = pick([
    `${hero} opened to ${pick([600, 800, 1000])}, ${villain} defended, check-called flop and turn, folded river to a ${pick([1800, 2400, 3200])} barrel`,
    `${hero} limped, ${villain} raised, ${hero} check-raised the ${pick(['A72r', 'T94cc', 'KQ2ss', 'J83r'])} flop and took it down`,
    `${villain} jammed ${pick([3200, 4100, 5600])} over ${hero}'s c-bet with a combo draw, ${hero} called with top pair and held`,
    `family pot, ${hero} rivered trips and value-bet ${pick([1200, 1600, 2200])}, paid off by ${villain}'s two pair`,
  ]);
  const talk = pick([
    `${villain} accused ${hero} of overbluffing; nobody showed.`,
    `${hero} showed the bluff and needled the table about it for two hands.`,
    `quiet hand, no table talk.`,
    `${villain} claimed the fold was disciplined; ${hero} tapped the table.`,
  ]);
  return `Hand #${n}: ${streets}. Pot ${pick([1900, 2600, 4400, 7200, 9800])}. ${talk}`;
}

const systemPrompt = buildBotSystemPrompt(game, game.bots[0]);
let userPrompt = buildDecisionPrompt(game, hand, 'Vesper', legal, recentChat);
const recaps: string[] = [];
for (let n = 1; systemPrompt.length + userPrompt.length + recaps.join('\n').length < targetChars; n++) {
  recaps.push(priorHandRecap(n));
}
userPrompt = userPrompt.replace(
  '## Your options',
  `## Previous hands (your notes)\n${recaps.join('\n')}\n\n## Your options`,
);

const JSON_INSTRUCTION = `\n\nRespond ONLY with a JSON object, no markdown fences: {"action": "fold"|"check"|"call"|"bet"|"raise", "amount": number (only for bet/raise, total raised TO), "reasoning": string, "tableTalk": string (optional)}`;

// ---- Vendor calls ----

interface Trial {
  ms: number;
  ok: boolean;
  action?: string;
  reasoningTokens?: number;
  outputTokens?: number;
  note?: string;
}

function extractJson(text: string): { action?: string } | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  for (let depth = 0, i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}' && --depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function callModel(modelId: string, thinking: boolean): Promise<Trial> {
  const config = getModelConfig(modelId);
  const apiKey = apiKeys[config.apiKeyName];
  if (!apiKey) throw new Error(`Missing ${config.apiKeyName} (env ${ENV_KEY_FALLBACKS[config.apiKeyName]})`);
  const user = userPrompt + JSON_INSTRUCTION;
  const started = Date.now();

  if (config.agentKind === 'anthropic') {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: config.modelApiName,
      max_tokens: config.maxOutputTokens,
      system: systemPrompt,
      thinking: thinking ? { type: 'adaptive' } : { type: 'disabled' },
      messages: [{ role: 'user', content: user }],
    });
    const ms = Date.now() - started;
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    const thought = response.content.some((b) => b.type === 'thinking');
    return {
      ms,
      ok: !!extractJson(text),
      action: extractJson(text)?.action,
      outputTokens: response.usage.output_tokens,
      note: thinking ? (thought ? 'adaptive: model chose to think' : 'adaptive: model chose NOT to think') : undefined,
    };
  }

  if (config.agentKind === 'google') {
    const client = new GoogleGenAI({ apiKey });
    const response = await client.models.generateContent({
      model: config.modelApiName,
      contents: [{ role: 'user', parts: [{ text: user }] }],
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: config.maxOutputTokens,
        thinkingConfig: { thinkingBudget: thinking ? -1 : 0 },
      },
    });
    const ms = Date.now() - started;
    return {
      ms,
      ok: !!extractJson(response.text ?? ''),
      action: extractJson(response.text ?? '')?.action ?? undefined,
      reasoningTokens: response.usageMetadata?.thoughtsTokenCount,
      outputTokens: response.usageMetadata?.candidatesTokenCount,
    };
  }

  // openai + openai-compatible: vendor-specific thinking knobs ride the request body.
  const client = new OpenAI({ apiKey, baseURL: config.baseUrl });
  const extra: Record<string, unknown> = {};
  let note: string | undefined;
  if (config.id === 'gpt') extra.reasoning_effort = thinking ? 'high' : 'none';
  else if (config.id === 'deepseek') extra.thinking = { type: thinking ? 'enabled' : 'disabled' };
  else if (config.id === 'kimi') {
    extra.reasoning_effort = thinking ? 'max' : 'low';
    note = thinking ? undefined : 'kimi-k3 cannot disable reasoning; "off" = reasoning_effort low';
  } else if (config.id === 'qwen') extra.enable_thinking = thinking;
  else throw new Error(`No thinking-toggle mapping for model '${config.id}' — add one in bench-vote-latency.ts`);

  const response = await client.chat.completions.create({
    model: config.modelApiName,
    max_completion_tokens: config.maxOutputTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: user },
    ],
    ...extra,
  });
  const ms = Date.now() - started;
  const text = response.choices[0]?.message?.content ?? '';
  return {
    ms,
    ok: !!extractJson(text),
    action: extractJson(text)?.action,
    reasoningTokens: response.usage?.completion_tokens_details?.reasoning_tokens,
    outputTokens: response.usage?.completion_tokens,
    note,
  };
}

// ---- Run ----

const fmt = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

async function main() {
  console.log(`prompt size: system ${systemPrompt.length} + user ${userPrompt.length + JSON_INSTRUCTION.length} = ${systemPrompt.length + userPrompt.length + JSON_INSTRUCTION.length} chars (target ${targetChars})`);
  console.log(`models: ${modelIds.join(', ')} — ${trials} trials per config, sequential\n`);

  for (const modelId of modelIds) {
    for (const thinking of [false, true]) {
      const label = `${modelId.padEnd(9)} thinking ${thinking ? 'ON ' : 'off'}`;
      const results: Trial[] = [];
      for (let i = 0; i < trials; i++) {
        try {
          results.push(await callModel(modelId, thinking));
        } catch (error) {
          console.log(`${label}  trial ${i + 1} FAILED: ${String(error).slice(0, 200)}`);
        }
      }
      if (!results.length) continue;
      const times = results.map((r) => r.ms).sort((a, b) => a - b);
      const median = times[Math.floor(times.length / 2)];
      const reasoning = results.map((r) => r.reasoningTokens).filter((t): t is number => t !== undefined);
      const notes = [...new Set(results.map((r) => r.note).filter(Boolean))];
      console.log(
        `${label}  median ${fmt(median)}  [${times.map(fmt).join(', ')}]` +
          `  actions: ${results.map((r) => (r.ok ? r.action : 'PARSE_FAIL')).join('/')}` +
          (reasoning.length ? `  reasoning tokens: ${reasoning.join('/')}` : '') +
          (notes.length ? `  (${notes.join('; ')})` : ''),
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
