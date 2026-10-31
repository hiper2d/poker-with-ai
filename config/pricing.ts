/**
 * Pricing: the library's MODEL_PRICING (USD per million tokens, keyed by model API name)
 * looked up by poker's catalog id, plus the paid-tier markup.
 *
 * Every agent response already carries `usage.costUSD`, computed upstream with the full
 * rules (cache tiers, extended-context surcharges, DeepSeek peak-hour pricing), so billing
 * never recomputes cost here. This module only serves the catalog page and free-tier
 * banding, which need the sticker prices.
 */
import { MODEL_PRICING, type ModelPricing } from '@hiper2d/ai-agents';
import { findModelConfig } from './models';

export type { ModelPricing };

/** Sticker prices for a (possibly retired) catalog id; undefined when unknown or unpriced. */
export function getModelPricing(modelId: string): ModelPricing | undefined {
  const config = findModelConfig(modelId);
  return config ? MODEL_PRICING[config.modelApiName] : undefined;
}

/**
 * Markup on model cost for paid-tier billing, werewolf's additive form:
 * charged = cost * (1 + PAID_TIER_MARKUP). Poker's rate is 30% (the profile page says so).
 */
export const PAID_TIER_MARKUP = 0.3;
