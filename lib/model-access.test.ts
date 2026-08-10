import { describe, expect, it } from 'vitest';
import { getFreeTierPolicy } from '@/config/tiers';
import {
  dealModels,
  deckCapacity,
  FREE_TIER_UNLIMITED,
  getModelPickerOptions,
  getPerGameModelLimit,
  getSelectableModelIds,
  validateModelUsageForTier,
} from './model-access';

describe('free-tier price banding', () => {
  it('gives cheap models unlimited free-tier bots', () => {
    // deepseek-flash: $0.28 × 2.5 = $0.70; gpt-mini/gemini-lite/mistral-small on sticker
    for (const id of ['deepseek-flash', 'gpt-mini', 'gemini-lite', 'mistral-small', 'qwen-flash']) {
      expect(getFreeTierPolicy(id)).toEqual({ available: true, maxBotsPerGame: -1 });
    }
  });

  it('bands models by effective output price', () => {
    // deepseek: $0.87 output × 2.5 thinking factor = $2.175 → 3-bot band
    expect(getFreeTierPolicy('deepseek')).toEqual({ available: true, maxBotsPerGame: 3 });
    // grok: $6 sticker, always-on reasoning (no factor) → 3-bot band
    expect(getFreeTierPolicy('grok')).toEqual({ available: true, maxBotsPerGame: 3 });
    // gpt: $12 → single-bot band
    expect(getFreeTierPolicy('gpt')).toEqual({ available: true, maxBotsPerGame: 1 });
    // claude: $15 × 2.5 = $37.5 → not available
    expect(getFreeTierPolicy('claude').available).toBe(false);
    // fugu: $30 sticker → not available
    expect(getFreeTierPolicy('fugu').available).toBe(false);
  });

  it('applies the kimi hand-set override despite its in-band sticker price', () => {
    expect(getFreeTierPolicy('kimi')).toEqual({ available: false, maxBotsPerGame: 0 });
  });
});

describe('getPerGameModelLimit', () => {
  it('is unlimited on non-free tiers', () => {
    expect(getPerGameModelLimit('claude', 'api')).toBe(FREE_TIER_UNLIMITED);
    expect(getPerGameModelLimit('fugu', 'paid')).toBe(FREE_TIER_UNLIMITED);
  });

  it('throws on unknown models', () => {
    expect(() => getPerGameModelLimit('nope', 'free')).toThrow(/Unsupported/);
  });
});

describe('getSelectableModelIds', () => {
  it('filters api tier by provided key names', () => {
    const ids = getSelectableModelIds('api', new Set(['ANTHROPIC_API_KEY', 'GROK_API_KEY']));
    expect(ids.sort()).toEqual(['claude', 'claude-fable', 'claude-haiku', 'claude-opus', 'grok']);
  });

  it('ignores keys on free tier and excludes unavailable models', () => {
    const ids = getSelectableModelIds('free', new Set());
    expect(ids).not.toContain('claude');
    expect(ids).not.toContain('kimi');
    expect(ids).not.toContain('fugu');
    expect(ids).toContain('deepseek');
  });
});

describe('getModelPickerOptions', () => {
  it('shows the full catalog on free tier with unavailable models disabled', () => {
    const options = getModelPickerOptions('free', new Set());
    const claude = options.find((o) => o.id === 'claude');
    expect(claude?.disabled).toBe(true);
    const deepseek = options.find((o) => o.id === 'deepseek');
    expect(deepseek).toEqual({ id: 'deepseek', disabled: false, suffix: '(3× per game)' });
  });
});

describe('deckCapacity', () => {
  it('sums per-model caps and reserves the GM slot', () => {
    // deepseek 3 + gpt 1 = 4; GM on gpt eats gpt's only slot → 3
    expect(deckCapacity(['deepseek', 'gpt'], 'free')).toBe(4);
    expect(deckCapacity(['deepseek', 'gpt'], 'free', 'gpt')).toBe(3);
    expect(deckCapacity(['deepseek'], 'api')).toBe(FREE_TIER_UNLIMITED);
  });
});

describe('dealModels', () => {
  it('cycles freely on non-free tiers', () => {
    const dealt = dealModels(['claude'], 5, 'api');
    expect(dealt).toEqual(['claude', 'claude', 'claude', 'claude', 'claude']);
  });

  it('respects per-model caps on the free tier', () => {
    const dealt = dealModels(['deepseek', 'gpt'], 4, 'free');
    expect(dealt.filter((id) => id === 'deepseek')).toHaveLength(3);
    expect(dealt.filter((id) => id === 'gpt')).toHaveLength(1);
  });

  it('reserves a slot for the GM model', () => {
    // gpt (1) reserved for GM → only deepseek's 3 remain
    expect(() => dealModels(['deepseek', 'gpt'], 4, 'free', 'gpt')).toThrow(/cover only 3/);
  });

  it('throws when capacity cannot cover the bots', () => {
    expect(() => dealModels(['gpt'], 2, 'free')).toThrow(/free tier/);
  });
});

describe('validateModelUsageForTier', () => {
  it('requires keys per model on the api tier', () => {
    expect(() =>
      validateModelUsageForTier('api', 'claude', ['grok'], new Set(['ANTHROPIC_API_KEY'])),
    ).toThrow(/GROK_API_KEY/);
    expect(() =>
      validateModelUsageForTier('api', 'claude', ['grok'], new Set(['ANTHROPIC_API_KEY', 'GROK_API_KEY'])),
    ).not.toThrow();
  });

  it('counts the GM against free-tier caps', () => {
    // gpt capped at 1: GM takes it, the bot copy overflows
    expect(() => validateModelUsageForTier('free', 'gpt', ['gpt'], new Set())).toThrow(/once/);
    expect(() => validateModelUsageForTier('free', 'deepseek', ['deepseek', 'deepseek'], new Set())).not.toThrow();
  });

  it('rejects free-tier-unavailable models', () => {
    expect(() => validateModelUsageForTier('free', 'deepseek', ['claude'], new Set())).toThrow(
      /not available on the free tier/,
    );
  });

  it('allows the full catalog on paid', () => {
    expect(() => validateModelUsageForTier('paid', 'claude', ['fugu', 'kimi'], new Set())).not.toThrow();
  });
});
