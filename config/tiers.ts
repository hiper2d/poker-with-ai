/**
 * Free-tier policy — availability and the per-game bot cap are DERIVED FROM PRICE, not
 * hand-tuned per model, so the two stay consistent (same scheme as werewolf). The metric
 * is output price ($/1M tokens), which dominates generation cost:
 *   <= $2  → unlimited bots
 *   <= $6  → up to FREE_TIER_LIMITED_MAX_BOTS bots
 *   <= $15 → 1 bot
 *   >  $15 → not available on the free tier
 *
 * Hybrid-thinking models (API offers a thinking toggle, we always run with reasoning on)
 * burn hidden reasoning tokens at the output rate, so their effective output price is
 * multiplied by FREE_TIER_THINKING_COST_FACTOR before banding. Always-on reasoning models
 * (gpt, gemini, grok, kimi, fugu) are banded on sticker price — their overhead hasn't
 * been measured.
 */
import { MODEL_PRICING } from './pricing';

/** Hard free-tier caps beyond the per-model bands (werewolf's FREE_TIER_LIMITS). */
export const FREE_TIER_LIMITS = {
  GAMES_PER_CALENDAR_DAY: 5,
} as const;

export const FREE_TIER_OUTPUT_PRICE_BANDS = {
  UNLIMITED_MAX: 2,
  LIMITED_MAX: 6,
  SINGLE_MAX: 15,
} as const;
export const FREE_TIER_LIMITED_MAX_BOTS = 3;
export const FREE_TIER_THINKING_COST_FACTOR = 2.5;

/** Picker ids of hybrid-thinking models (pay the reasoning multiplier when banding).
 *  Matches werewolf's set; claude-fable and the always-on reasoners stay off it. */
const HYBRID_THINKING_IDS = new Set([
  'claude-opus',
  'claude',
  'claude-haiku',
  'deepseek-flash',
  'deepseek',
  'glm',
  'qwen',
  'qwen-plus',
  'qwen-flash',
  'minimax',
]);

/** Whether the ×FREE_TIER_THINKING_COST_FACTOR reasoning multiplier applies when banding. */
export function isHybridThinkingModel(modelId: string): boolean {
  return HYBRID_THINKING_IDS.has(modelId);
}

export interface FreeTierPolicy {
  available: boolean;
  /** -1 = unlimited, 0 = not available, otherwise the per-game cap. */
  maxBotsPerGame: number;
}

/**
 * Hand-set overrides for models whose sticker price misrepresents real cost.
 * kimi: measured cost runs far above its listed output price (werewolf opts it out too).
 */
const FREE_TIER_OVERRIDES: Record<string, FreeTierPolicy> = {
  kimi: { available: false, maxBotsPerGame: 0 },
};

export function getFreeTierPolicy(modelId: string): FreeTierPolicy {
  const override = FREE_TIER_OVERRIDES[modelId];
  if (override) return override;
  const pricing = MODEL_PRICING[modelId];
  if (!pricing) return { available: false, maxBotsPerGame: 0 };

  const effectiveOutput = HYBRID_THINKING_IDS.has(modelId)
    ? pricing.outputPerMTok * FREE_TIER_THINKING_COST_FACTOR
    : pricing.outputPerMTok;

  if (effectiveOutput <= FREE_TIER_OUTPUT_PRICE_BANDS.UNLIMITED_MAX)
    return { available: true, maxBotsPerGame: -1 };
  if (effectiveOutput <= FREE_TIER_OUTPUT_PRICE_BANDS.LIMITED_MAX)
    return { available: true, maxBotsPerGame: FREE_TIER_LIMITED_MAX_BOTS };
  if (effectiveOutput <= FREE_TIER_OUTPUT_PRICE_BANDS.SINGLE_MAX)
    return { available: true, maxBotsPerGame: 1 };
  return { available: false, maxBotsPerGame: 0 };
}
