/**
 * Per-model pricing, USD per million tokens. Kept apart from the capability catalog.
 * Numbers ported from werewolf's maintained MODEL_PRICING (verified there against provider
 * docs, July-Aug 2026). Extended-context and peak-hour surcharges are not modeled yet —
 * see the cost-tracking task before relying on this for billing.
 */
export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
  cachedInputPerMTok?: number;
}

/** Keyed by picker id (ModelConfig.id), not modelApiName. */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Anthropic
  'claude-fable': { inputPerMTok: 10, outputPerMTok: 50, cachedInputPerMTok: 1 },
  'claude-opus': { inputPerMTok: 5, outputPerMTok: 25, cachedInputPerMTok: 0.5 },
  claude: { inputPerMTok: 2, outputPerMTok: 10, cachedInputPerMTok: 0.2 },
  'claude-haiku': { inputPerMTok: 1, outputPerMTok: 5, cachedInputPerMTok: 0.1 },
  // OpenAI
  'gpt-sol': { inputPerMTok: 5, outputPerMTok: 30, cachedInputPerMTok: 0.5 },
  gpt: { inputPerMTok: 2, outputPerMTok: 12, cachedInputPerMTok: 0.2 },
  'gpt-mini': { inputPerMTok: 0.2, outputPerMTok: 1.2, cachedInputPerMTok: 0.02 },
  // Google
  gemini: { inputPerMTok: 2, outputPerMTok: 12, cachedInputPerMTok: 0.2 },
  // Gemini 3.7 Flash launch pricing through 2026-12-31; doubles to 1.5/7.5/0.15 on
  // 2027-01-01 (ai.google.dev, fetched 2026-08-13) — ACTION NEEDED then: update these rates,
  // which also drops it back out of the free-tier single-bot band (>$6 output).
  'gemini-flash': { inputPerMTok: 0.75, outputPerMTok: 3.75, cachedInputPerMTok: 0.075 },
  'gemini-lite': { inputPerMTok: 0.3, outputPerMTok: 1.5, cachedInputPerMTok: 0.025 },
  // DeepSeek — new base (off-peak) rates, provider-effective 2026-08-16; charged from deploy,
  // matching werewolf's carry-the-higher-price policy. The 2× peak surcharge (UTC 1-4 and
  // 6-10) is a peak-hour surcharge and is not modeled here — see the header.
  'deepseek-flash': { inputPerMTok: 0.22, outputPerMTok: 0.66, cachedInputPerMTok: 0.007 },
  deepseek: { inputPerMTok: 0.66, outputPerMTok: 1.98, cachedInputPerMTok: 0.022 },
  // Grok (cached price is per-model on xAI, not a uniform ratio; rates double past 200K
  // context — not modeled, see header)
  grok: { inputPerMTok: 2, outputPerMTok: 6, cachedInputPerMTok: 0.5 },
  // Mistral (cached tokens bill at 10% of input price)
  'mistral-large': { inputPerMTok: 0.5, outputPerMTok: 1.5, cachedInputPerMTok: 0.05 },
  'mistral-medium': { inputPerMTok: 1.5, outputPerMTok: 7.5, cachedInputPerMTok: 0.15 },
  'mistral-small': { inputPerMTok: 0.15, outputPerMTok: 0.6, cachedInputPerMTok: 0.015 },
  'mistral-magistral': { inputPerMTok: 2, outputPerMTok: 5, cachedInputPerMTok: 0.2 },
  // Moonshot
  kimi: { inputPerMTok: 3, outputPerMTok: 15, cachedInputPerMTok: 0.3 },
  // Z.AI
  glm: { inputPerMTok: 1.4, outputPerMTok: 4.4, cachedInputPerMTok: 0.26 },
  // Qwen (cache hits bill at 20% of input price)
  qwen: { inputPerMTok: 2, outputPerMTok: 6, cachedInputPerMTok: 0.4 },
  'qwen-plus': { inputPerMTok: 0.4, outputPerMTok: 1.6, cachedInputPerMTok: 0.08 },
  'qwen-flash': { inputPerMTok: 0.03, outputPerMTok: 0.13, cachedInputPerMTok: 0.006 },
  // MiniMax
  minimax: { inputPerMTok: 0.3, outputPerMTok: 1.2, cachedInputPerMTok: 0.06 },
  // Sakana
  fugu: { inputPerMTok: 5, outputPerMTok: 30, cachedInputPerMTok: 0.5 },
};

/**
 * Markup on model cost for paid-tier billing, werewolf's additive form:
 * charged = cost * (1 + PAID_TIER_MARKUP). Poker's rate is 30% (the profile page says so).
 */
export const PAID_TIER_MARKUP = 0.3;

export function computeCostUsd(
  modelId: string,
  usage: { inputTokens: number; outputTokens: number; cachedInputTokens?: number },
): number {
  const p = MODEL_PRICING[modelId];
  if (!p) return 0;
  const cached = usage.cachedInputTokens ?? 0;
  return (
    ((usage.inputTokens - cached) * p.inputPerMTok +
      cached * (p.cachedInputPerMTok ?? p.inputPerMTok) +
      usage.outputTokens * p.outputPerMTok) /
    1_000_000
  );
}
