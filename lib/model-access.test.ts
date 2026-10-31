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
    // deepseek-pro: $1.98 output × 2.5 thinking factor = $4.95 → single-bot band
    expect(getFreeTierPolicy('deepseek-pro')).toEqual({ available: true, maxBotsPerGame: 1 });
    // grok: $6 sticker, always-on reasoning (no factor) → single-bot band
    expect(getFreeTierPolicy('grok')).toEqual({ available: true, maxBotsPerGame: 1 });
    // gemini-flash: $3.75 launch-price sticker, always-on reasoning → single-bot band
    expect(getFreeTierPolicy('gemini-flash')).toEqual({ available: true, maxBotsPerGame: 1 });
    // gpt: $5 (GPT-6.1 Terra) → single-bot band
    expect(getFreeTierPolicy('gpt')).toEqual({ available: true, maxBotsPerGame: 1 });
    // claude-sonnet: $10 × 2.5 = $25 → not available
    expect(getFreeTierPolicy('claude-sonnet').available).toBe(false);
    // gpt-astra: $50 sticker → not available
    expect(getFreeTierPolicy('gpt-astra').available).toBe(false);
  });

  it('applies the kimi hand-set override despite its in-band sticker price', () => {
    expect(getFreeTierPolicy('kimi')).toEqual({ available: false, maxBotsPerGame: 0 });
  });
});

describe('getPerGameModelLimit', () => {
  it('is unlimited on the paid tier', () => {
    expect(getPerGameModelLimit('claude-sonnet', 'paid')).toBe(FREE_TIER_UNLIMITED);
    expect(getPerGameModelLimit('gpt-astra', 'paid')).toBe(FREE_TIER_UNLIMITED);
  });

  it('throws on unknown models', () => {
    expect(() => getPerGameModelLimit('nope', 'free')).toThrow(/Unsupported/);
  });
});

describe('getCandidateModelIdsForTier', () => {
  it('excludes unavailable models on the free tier', () => {
    const ids = getCandidateModelIdsForTier('free');
    expect(ids).not.toContain('claude-sonnet');
    expect(ids).not.toContain('kimi');
    expect(ids).not.toContain('gpt-astra');
    expect(ids).not.toContain('gpt-astra');
    expect(ids).toContain('deepseek-pro');
  });

  it('offers the full catalog on paid', () => {
    const ids = getCandidateModelIdsForTier('paid');
    expect(ids).toContain('claude-sonnet');
    expect(ids).toContain('kimi');
    expect(ids).toContain('gpt-astra');
  });
});

describe('getModelPickerOptions', () => {
  it('shows the full catalog on free tier with unavailable models disabled', () => {
    const options = getModelPickerOptions('free');
    const claude = options.find((o) => o.id === 'claude-sonnet');
    expect(claude?.disabled).toBe(true);
    const deepseek = options.find((o) => o.id === 'deepseek-pro');
    expect(deepseek).toEqual({ id: 'deepseek-pro', disabled: false, suffix: '(1× per game)' });
  });

  it('enables everything on paid', () => {
    const options = getModelPickerOptions('paid');
    expect(options.every((o) => !o.disabled)).toBe(true);
  });
});

describe('deckCapacity', () => {
  it('sums per-model caps and reserves the GM slot', () => {
    // deepseek-pro 1 + grok 1 = 2; GM on grok eats grok's only slot → 1
    expect(deckCapacity(['deepseek-pro', 'grok'], 'free')).toBe(2);
    expect(deckCapacity(['deepseek-pro', 'grok'], 'free', 'grok')).toBe(1);
    expect(deckCapacity(['deepseek-pro'], 'paid')).toBe(FREE_TIER_UNLIMITED);
  });
});

describe('dealModels', () => {
  it('cycles freely on the paid tier', () => {
    const dealt = dealModels(['claude-sonnet'], 5, 'paid');
    expect(dealt).toEqual(['claude-sonnet', 'claude-sonnet', 'claude-sonnet', 'claude-sonnet', 'claude-sonnet']);
  });

  it('respects per-model caps on the free tier', () => {
    const dealt = dealModels(['deepseek-pro', 'grok'], 2, 'free');
    expect(dealt.filter((id) => id === 'deepseek-pro')).toHaveLength(1);
    expect(dealt.filter((id) => id === 'grok')).toHaveLength(1);
  });

  it('reserves a slot for the GM model', () => {
    // grok (1) reserved for GM → only deepseek's 1 remains
    expect(() => dealModels(['deepseek-pro', 'grok'], 2, 'free', 'grok')).toThrow(/cover only 1/);
  });

  it('throws when capacity cannot cover the bots', () => {
    expect(() => dealModels(['grok'], 2, 'free')).toThrow(/free tier/);
  });
});

describe('retired persisted ids', () => {
  it('resolve to their catalog ids everywhere a persisted id is read', () => {
    // 'claude' (pre-library id) is Claude 5 Sonnet: off the free tier, unlimited on paid.
    expect(getPerGameModelLimit('claude', 'free')).toBe(0);
    expect(getPerGameModelLimit('claude', 'paid')).toBe(FREE_TIER_UNLIMITED);
    expect(getFreeTierPolicy('deepseek')).toEqual(getFreeTierPolicy('deepseek-pro'));
    // An old and a new spelling of the same model share one free-tier cap.
    expect(() => validateModelUsageForTier('free', 'deepseek', ['deepseek-pro'])).toThrow(/once/);
  });
});

describe('validateModelUsageForTier', () => {
  it('counts the GM against free-tier caps', () => {
    // deepseek-pro capped at 1: GM takes it, the bot copy overflows
    expect(() => validateModelUsageForTier('free', 'deepseek-pro', ['deepseek-pro'])).toThrow(/once/);
    expect(() =>
      validateModelUsageForTier('free', 'deepseek-flash', ['deepseek-flash', 'deepseek-flash']),
    ).not.toThrow();
  });

  it('rejects free-tier-unavailable models', () => {
    expect(() => validateModelUsageForTier('free', 'deepseek-pro', ['claude-sonnet'])).toThrow(
      /not available on the free tier/,
    );
  });

  it('allows the full catalog on paid', () => {
    expect(() => validateModelUsageForTier('paid', 'claude-sonnet', ['gpt-astra', 'kimi'])).not.toThrow();
  });
});
