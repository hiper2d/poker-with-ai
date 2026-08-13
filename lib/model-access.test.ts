import { describe, expect, it } from 'vitest';
import { getFreeTierPolicy } from '@/config/tiers';
import {
  dealModels,
  deckCapacity,
  FREE_TIER_UNLIMITED,
  getCandidateModelIdsForTier,
  getModelPickerOptions,
  getPerGameModelLimit,
  validateModelUsageForTier,
} from './model-access';

describe('free-tier price banding', () => {
  it('gives cheap models unlimited free-tier bots', () => {
    // deepseek-flash: $0.66 × 2.5 = $1.65; gpt-mini/gemini-lite/mistral-small on sticker
    for (const id of ['deepseek-flash', 'gpt-mini', 'gemini-lite', 'mistral-small', 'qwen-flash']) {
      expect(getFreeTierPolicy(id)).toEqual({ available: true, maxBotsPerGame: -1 });
    }
  });

  it('bands models by effective output price', () => {
    // deepseek: $1.98 output × 2.5 thinking factor = $4.95 → single-bot band
    expect(getFreeTierPolicy('deepseek')).toEqual({ available: true, maxBotsPerGame: 1 });
    // grok: $6 sticker, always-on reasoning (no factor) → single-bot band
    expect(getFreeTierPolicy('grok')).toEqual({ available: true, maxBotsPerGame: 1 });
    // gemini-flash: $3.75 launch-price sticker, always-on reasoning → single-bot band
    expect(getFreeTierPolicy('gemini-flash')).toEqual({ available: true, maxBotsPerGame: 1 });
    // gpt: $12 → not available
    expect(getFreeTierPolicy('gpt').available).toBe(false);
    // claude: $10 × 2.5 = $25 → not available
    expect(getFreeTierPolicy('claude').available).toBe(false);
    // fugu: $30 sticker → not available
    expect(getFreeTierPolicy('fugu').available).toBe(false);
  });

  it('applies the kimi hand-set override despite its in-band sticker price', () => {
    expect(getFreeTierPolicy('kimi')).toEqual({ available: false, maxBotsPerGame: 0 });
  });
});

describe('getPerGameModelLimit', () => {
  it('is unlimited on the paid tier', () => {
    expect(getPerGameModelLimit('claude', 'paid')).toBe(FREE_TIER_UNLIMITED);
    expect(getPerGameModelLimit('fugu', 'paid')).toBe(FREE_TIER_UNLIMITED);
  });

  it('throws on unknown models', () => {
    expect(() => getPerGameModelLimit('nope', 'free')).toThrow(/Unsupported/);
  });
});

describe('getCandidateModelIdsForTier', () => {
  it('excludes unavailable models on the free tier', () => {
    const ids = getCandidateModelIdsForTier('free');
    expect(ids).not.toContain('claude');
    expect(ids).not.toContain('kimi');
    expect(ids).not.toContain('fugu');
    expect(ids).not.toContain('gpt');
    expect(ids).toContain('deepseek');
  });

  it('offers the full catalog on paid', () => {
    const ids = getCandidateModelIdsForTier('paid');
    expect(ids).toContain('claude');
    expect(ids).toContain('kimi');
    expect(ids).toContain('fugu');
  });
});

describe('getModelPickerOptions', () => {
  it('shows the full catalog on free tier with unavailable models disabled', () => {
    const options = getModelPickerOptions('free');
    const claude = options.find((o) => o.id === 'claude');
    expect(claude?.disabled).toBe(true);
    const deepseek = options.find((o) => o.id === 'deepseek');
    expect(deepseek).toEqual({ id: 'deepseek', disabled: false, suffix: '(1× per game)' });
  });

  it('enables everything on paid', () => {
    const options = getModelPickerOptions('paid');
    expect(options.every((o) => !o.disabled)).toBe(true);
  });
});

describe('deckCapacity', () => {
  it('sums per-model caps and reserves the GM slot', () => {
    // deepseek 1 + grok 1 = 2; GM on grok eats grok's only slot → 1
    expect(deckCapacity(['deepseek', 'grok'], 'free')).toBe(2);
    expect(deckCapacity(['deepseek', 'grok'], 'free', 'grok')).toBe(1);
    expect(deckCapacity(['deepseek'], 'paid')).toBe(FREE_TIER_UNLIMITED);
  });
});

describe('dealModels', () => {
  it('cycles freely on the paid tier', () => {
    const dealt = dealModels(['claude'], 5, 'paid');
    expect(dealt).toEqual(['claude', 'claude', 'claude', 'claude', 'claude']);
  });

  it('respects per-model caps on the free tier', () => {
    const dealt = dealModels(['deepseek', 'grok'], 2, 'free');
    expect(dealt.filter((id) => id === 'deepseek')).toHaveLength(1);
    expect(dealt.filter((id) => id === 'grok')).toHaveLength(1);
  });

  it('reserves a slot for the GM model', () => {
    // grok (1) reserved for GM → only deepseek's 1 remains
    expect(() => dealModels(['deepseek', 'grok'], 2, 'free', 'grok')).toThrow(/cover only 1/);
  });

  it('throws when capacity cannot cover the bots', () => {
    expect(() => dealModels(['grok'], 2, 'free')).toThrow(/free tier/);
  });
});

describe('validateModelUsageForTier', () => {
  it('counts the GM against free-tier caps', () => {
    // deepseek capped at 1: GM takes it, the bot copy overflows
    expect(() => validateModelUsageForTier('free', 'deepseek', ['deepseek'])).toThrow(/once/);
    expect(() =>
      validateModelUsageForTier('free', 'deepseek-flash', ['deepseek-flash', 'deepseek-flash']),
    ).not.toThrow();
  });

  it('rejects free-tier-unavailable models', () => {
    expect(() => validateModelUsageForTier('free', 'deepseek', ['claude'])).toThrow(
      /not available on the free tier/,
    );
  });

  it('allows the full catalog on paid', () => {
    expect(() => validateModelUsageForTier('paid', 'claude', ['fugu', 'kimi'])).not.toThrow();
  });
});
