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
  claude: { inputPerMTok: 3, outputPerMTok: 15, cachedInputPerMTok: 0.2 },
  'claude-haiku': { inputPerMTok: 1, outputPerMTok: 5, cachedInputPerMTok: 0.1 },
  // OpenAI
  'gpt-sol': { inputPerMTok: 5, outputPerMTok: 30, cachedInputPerMTok: 0.5 },
  gpt: { inputPerMTok: 2, outputPerMTok: 12, cachedInputPerMTok: 0.2 },
  'gpt-mini': { inputPerMTok: 0.2, outputPerMTok: 1.2, cachedInputPerMTok: 0.02 },
  // Google
  gemini: { inputPerMTok: 2, outputPerMTok: 12, cachedInputPerMTok: 0.2 },
  'gemini-flash': { inputPerMTok: 1.5, outputPerMTok: 7.5, cachedInputPerMTok: 0.15 },
  'gemini-lite': { inputPerMTok: 0.3, outputPerMTok: 1.5, cachedInputPerMTok: 0.025 },
  // DeepSeek
  'deepseek-flash': { inputPerMTok: 0.14, outputPerMTok: 0.28, cachedInputPerMTok: 0.0028 },
  deepseek: { inputPerMTok: 0.435, outputPerMTok: 0.87, cachedInputPerMTok: 0.003625 },
  // Grok
  grok: { inputPerMTok: 2, outputPerMTok: 6, cachedInputPerMTok: 0.3 },
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

export const PAID_TIER_MARKUP = 1.3;

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
