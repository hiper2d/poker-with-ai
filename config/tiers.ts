/**
 * Free-tier policy — availability and the per-game bot cap are DERIVED FROM PRICE, not
 * hand-tuned per model, so the two stay consistent (same scheme as werewolf). The metric
 * is output price ($/1M tokens), which dominates generation cost:
 *   <= $2  → unlimited bots
 *   <= $6  → 1 bot
 *   >  $6  → not available on the free tier
 *
 * Hybrid-thinking models (API offers a thinking toggle, the catalog always runs them with
 * reasoning on — the library's isHybridThinkingModel) burn hidden reasoning tokens at the
 * output rate, so their effective output price is multiplied by FREE_TIER_THINKING_COST_FACTOR
 * before banding. Always-on reasoning models (GPT, Gemini, Grok, Kimi, Fugu, Magistral,
 * Muse Spark) are banded on sticker price — their overhead hasn't been measured.
 */
import { isHybridThinkingModel as libIsHybridThinkingModel } from '@hiper2d/ai-agents';
import { findModelConfig, resolveModelId } from './models';
import { getModelPricing } from './pricing';

/** Hard free-tier caps beyond the per-model bands (werewolf's FREE_TIER_LIMITS). */
export const FREE_TIER_LIMITS = {
  GAMES_PER_CALENDAR_DAY: 5,
} as const;

export const FREE_TIER_OUTPUT_PRICE_BANDS = {
  UNLIMITED_MAX: 2,
  SINGLE_MAX: 6,
} as const;
export const FREE_TIER_THINKING_COST_FACTOR = 2.5;

/** Whether the ×FREE_TIER_THINKING_COST_FACTOR reasoning multiplier applies when banding. */
export function isHybridThinkingModel(modelId: string): boolean {
  const config = findModelConfig(modelId);
  return config !== undefined && libIsHybridThinkingModel(config.modelApiName);
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
  const override = FREE_TIER_OVERRIDES[resolveModelId(modelId)];
  if (override) return override;
  const pricing = getModelPricing(modelId);
  if (!pricing) return { available: false, maxBotsPerGame: 0 };

  const effectiveOutput = isHybridThinkingModel(modelId)
    ? pricing.outputPrice * FREE_TIER_THINKING_COST_FACTOR
    : pricing.outputPrice;

  if (effectiveOutput <= FREE_TIER_OUTPUT_PRICE_BANDS.UNLIMITED_MAX)
    return { available: true, maxBotsPerGame: -1 };
  if (effectiveOutput <= FREE_TIER_OUTPUT_PRICE_BANDS.SINGLE_MAX)
    return { available: true, maxBotsPerGame: 1 };
  return { available: false, maxBotsPerGame: 0 };
}
