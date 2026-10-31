import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/screen/records', () => ({
  getScreenMode: vi.fn(async () => 'monitor'),
  saveScreenCall: vi.fn(async () => {}),
}));
vi.mock('@/lib/cost-tracking', () => ({
  recordScreenUsage: vi.fn(async () => {}),
  chargeUsageOutsideGame: vi.fn(async () => {}),
}));
vi.mock('@/lib/logging/logger', () => {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  return { logger: { ...log, with: () => log } };
});
vi.mock('@/lib/screen/jev-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/screen/jev-client')>()),
  askJev: vi.fn(),
}));
vi.mock('@/lib/screen/openai-decisions-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/screen/openai-decisions-client')>()),
  askOpenAiDecisions: vi.fn(),
}));

import { chargeUsageOutsideGame, recordScreenUsage } from '@/lib/cost-tracking';
import { askJev } from '@/lib/screen/jev-client';
import { askOpenAiDecisions } from '@/lib/screen/openai-decisions-client';
import { getScreenMode, saveScreenCall } from '@/lib/screen/records';
import { buildScreenRequest, decideScreen, screenHumanInput, screenRejectionMessage } from '@/lib/screen/screen';
import type { Game } from '@/models/game';

const KEYS = { TYPESAFE_API_KEY: 'jev', OPENAI_API_KEY: 'oai' };
const game = { id: 'g1', handNumber: 3 } as Game;

/** Judge answers: a risk score plus flag probabilities (unnamed flags 0). */
function answers(score: number, flags: Record<string, number> = {}, top = 0) {
  return {
    risk: { score, legend: '', confidence: 1, probabilities: { 0: 1 - top, 1: 0, 2: top / 2, 3: top / 2 } },
    sexual: { noul: 0 }, minors: { noul: 0 }, real_person_sexual: { noul: 0 }, real_person: { noul: 0 },
    hate: { noul: 0 }, real_harm: { noul: 0 }, jailbreak: { noul: 0 },
    ...Object.fromEntries(Object.entries(flags).map(([k, v]) => [k, { noul: v }])),
  };
}

function judged(a: ReturnType<typeof answers>, model = 'jev-latest') {
  return { model, answers: a, usage: { input_tokens: 400, output_tokens: 0 }, inputTokens: 400, costUSD: 0.00002, durationMs: 150 };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getScreenMode).mockResolvedValue('monitor');
});

describe('decideScreen', () => {
  it('passes ordinary table talk', () => {
    expect(decideScreen(answers(0.2)).verdict).toBe('ok');
  });

  it('blocks only on a hard flag at its bar, naming the flag', () => {
    expect(decideScreen(answers(0.5, { minors: 0.92 }))).toMatchObject({ verdict: 'would_block', reason: 'minors' });
    expect(decideScreen(answers(0.5, { minors: 0.89 })).verdict).toBe('ok');
    expect(decideScreen(answers(0.5, { real_person_sexual: 0.95 })).reason).toBe('real_person_sexual');
  });

  it('never blocks on hate, sexual or jailbreak — they are grey at most', () => {
    const d = decideScreen(answers(2.6, { hate: 0.98, sexual: 0.97, jailbreak: 0.99 }, 0.9));
    expect(d.verdict).toBe('grey');
    expect(d.reason).toBe('jailbreak');
  });

  it('greys a high score without a reason', () => {
    expect(decideScreen(answers(1.3))).toMatchObject({ verdict: 'grey', reason: null });
  });
});

describe('buildScreenRequest', () => {
  it('asks the risk score and every flag, framed as poker', () => {
    const { state, questions } = buildScreenRequest('chat', 'all in, you coward');
    expect(state.text).toBe('all in, you coward');
    expect(String(state.context)).toMatch(/poker/i);
    expect(Object.keys(questions).sort()).toEqual(
      ['hate', 'jailbreak', 'minors', 'real_harm', 'real_person', 'real_person_sexual', 'risk', 'sexual'],
    );
  });
});

describe('screenRejectionMessage', () => {
  it('names the input and the category, never the score', () => {
    expect(screenRejectionMessage('chat', 'real_harm')).toBe(
      "This message can't be sent to the AI players because it describes real-world harm. Please rephrase it.",
    );
    expect(screenRejectionMessage('preview', null)).toBe("This game setup can't be sent to the AI players. Please rephrase it.");
  });
});

describe('screenHumanInput', () => {
  it('skips without any judge key — no call, no record', async () => {
    const out = await screenHumanInput({ source: 'chat', text: 'hi', userEmail: 'u', apiKeys: {}, game });
    expect(out).toMatchObject({ verdict: 'skipped', blocked: false });
    expect(askJev).not.toHaveBeenCalled();
    expect(saveScreenCall).not.toHaveBeenCalled();
  });

  it('skips when the mode is off', async () => {
    vi.mocked(getScreenMode).mockResolvedValue('off');
    const out = await screenHumanInput({ source: 'chat', text: 'hi', userEmail: 'u', apiKeys: KEYS, game });
    expect(out.verdict).toBe('skipped');
    expect(askJev).not.toHaveBeenCalled();
  });

  it('monitor mode records a would-block but lets it through, billing both judges to the game', async () => {
    vi.mocked(askJev).mockResolvedValue(judged(answers(3, { real_harm: 0.97 })) as never);
    vi.mocked(askOpenAiDecisions).mockResolvedValue(judged(answers(1), 'gpt-6-luna') as never);
    const out = await screenHumanInput({ source: 'chat', text: 'x', userEmail: 'u', apiKeys: KEYS, game });
    expect(out).toMatchObject({ verdict: 'would_block', reason: 'real_harm', mode: 'monitor', blocked: false });
    expect(recordScreenUsage).toHaveBeenCalledTimes(2);
    const row = vi.mocked(saveScreenCall).mock.calls[0][0];
    expect(row).toMatchObject({ gameId: 'g1', handNumber: 3, model: 'jev-latest', enforced: false });
    expect(row.shadow).toMatchObject({ model: 'gpt-6-luna', verdict: 'ok' });
  });

  it('enforce mode rejects a would-block with the player-facing message', async () => {
    vi.mocked(getScreenMode).mockResolvedValue('enforce');
    vi.mocked(askJev).mockResolvedValue(judged(answers(3, { minors: 0.95 })) as never);
    vi.mocked(askOpenAiDecisions).mockResolvedValue(judged(answers(3), 'gpt-6-luna') as never);
    const out = await screenHumanInput({ source: 'chat', text: 'x', userEmail: 'u', apiKeys: KEYS, game });
    expect(out.blocked).toBe(true);
    expect(out.message).toMatch(/sexualizes a minor/);
    expect(vi.mocked(saveScreenCall).mock.calls[0][0].enforced).toBe(true);
  });

  it('enforce mode lets a grey verdict through', async () => {
    vi.mocked(getScreenMode).mockResolvedValue('enforce');
    vi.mocked(askJev).mockResolvedValue(judged(answers(2.5, { hate: 0.99 }, 0.9)) as never);
    vi.mocked(askOpenAiDecisions).mockResolvedValue(judged(answers(0)) as never);
    const out = await screenHumanInput({ source: 'chat', text: 'x', userEmail: 'u', apiKeys: KEYS, game });
    expect(out).toMatchObject({ verdict: 'grey', blocked: false });
  });

  it('OpenAI Decisions decides when Jev fails', async () => {
    vi.mocked(getScreenMode).mockResolvedValue('enforce');
    vi.mocked(askJev).mockRejectedValue(Object.assign(new Error('Jev request timed out after 3000 ms'), { status: null }));
    vi.mocked(askOpenAiDecisions).mockResolvedValue(judged(answers(3, { real_harm: 0.95 }), 'gpt-6-luna') as never);
    const out = await screenHumanInput({ source: 'chat', text: 'x', userEmail: 'u', apiKeys: KEYS, game });
    expect(out.blocked).toBe(true);
    const row = vi.mocked(saveScreenCall).mock.calls[0][0];
    expect(row.model).toBe('gpt-6-luna');
    expect(row.shadow).toMatchObject({ verdict: 'error', error: expect.stringMatching(/timed out/) });
  });

  it('fails open when both judges fail, recording an error row', async () => {
    vi.mocked(getScreenMode).mockResolvedValue('enforce');
    vi.mocked(askJev).mockRejectedValue(Object.assign(new Error('Jev returned HTTP 500'), { status: 500, body: 'boom' }));
    vi.mocked(askOpenAiDecisions).mockRejectedValue(new Error('down'));
    const out = await screenHumanInput({ source: 'chat', text: 'x', userEmail: 'u', apiKeys: KEYS, game });
    expect(out).toMatchObject({ verdict: 'error', blocked: false });
    expect(vi.mocked(saveScreenCall).mock.calls[0][0]).toMatchObject({ verdict: 'error', httpStatus: 500, error: 'Jev returned HTTP 500: boom' });
    expect(recordScreenUsage).not.toHaveBeenCalled();
  });

  it('runs on Decisions alone when there is no Jev key', async () => {
    vi.mocked(askOpenAiDecisions).mockResolvedValue(judged(answers(0), 'gpt-6-luna') as never);
    const out = await screenHumanInput({ source: 'chat', text: 'x', userEmail: 'u', apiKeys: { OPENAI_API_KEY: 'oai' }, game });
    expect(out.verdict).toBe('ok');
    expect(askJev).not.toHaveBeenCalled();
    expect(vi.mocked(saveScreenCall).mock.calls[0][0].shadow).toBeUndefined();
  });

  it('bills a preview to the user tier — there is no game yet', async () => {
    vi.mocked(askJev).mockResolvedValue(judged(answers(0)) as never);
    vi.mocked(askOpenAiDecisions).mockResolvedValue(judged(answers(0), 'gpt-6-luna') as never);
    await screenHumanInput({ source: 'preview', text: 'x', userEmail: 'u', apiKeys: KEYS, tier: 'paid' });
    expect(chargeUsageOutsideGame).toHaveBeenCalledWith('u', 'paid', 0.00002);
    expect(recordScreenUsage).not.toHaveBeenCalled();
    expect(vi.mocked(saveScreenCall).mock.calls[0][0].gameId).toBeNull();
  });

  it('never throws when billing fails (an empty paid balance)', async () => {
    vi.mocked(askJev).mockResolvedValue(judged(answers(0)) as never);
    vi.mocked(askOpenAiDecisions).mockResolvedValue(judged(answers(0), 'gpt-6-luna') as never);
    vi.mocked(recordScreenUsage).mockRejectedValue(new Error('Insufficient balance'));
    await expect(screenHumanInput({ source: 'chat', text: 'x', userEmail: 'u', apiKeys: KEYS, game })).resolves.toMatchObject({ verdict: 'ok' });
  });
});
