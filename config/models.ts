/**
 * Poker's model configuration: the @hiper2d/ai-agents catalog plus app policy.
 *
 * The library owns the facts and tuning defaults — model API names, key names, thinking
 * dialects, reasoning effort, output ceilings, prices. This module overlays what is poker's
 * business, not the library's: the picker-facing catalog shape the UI renders, env-var
 * fallbacks for platform keys, deprecated-id migration for persisted game docs, and the
 * story-generation output profile. Free-tier policy lives in config/tiers.ts.
 *
 * Model facts belong upstream: a wrong price, a new model or a provider contract change is
 * fixed in the library (src/catalog.ts + its agent), released, and the dependency bumped here.
 */
import {
  API_KEY_CONSTANTS,
  LLM_CONSTANTS,
  SupportedAiKeyNames,
  SupportedAiModels,
  modelIsFast as libModelIsFast,
  type AbstractAgent,
  type ApiKeyMap as LibApiKeyMap,
  type ModelTag,
} from '@hiper2d/ai-agents';

export { LLM_CONSTANTS };
export type { ModelTag };

/** Key names as the library and the shared config/freeTierApiKeys doc spell them. */
export type ApiKeyName = (typeof API_KEY_CONSTANTS)[keyof typeof API_KEY_CONSTANTS];
export type ApiKeyMap = LibApiKeyMap;

/**
 * Dev/local fallback: when a key is missing from the shared config/freeTierApiKeys doc,
 * it is read from these env vars (same naming convention as werewolf's .env).
 */
export const ENV_KEY_FALLBACKS: Record<ApiKeyName, string> = {
  [API_KEY_CONSTANTS.ANTHROPIC]: 'ANTHROPIC_K',
  [API_KEY_CONSTANTS.OPENAI]: 'OPENAI_K',
  [API_KEY_CONSTANTS.GOOGLE]: 'GOOGLE_K',
  [API_KEY_CONSTANTS.MISTRAL]: 'MISTRAL_K',
  [API_KEY_CONSTANTS.DEEPSEEK]: 'DEEP_SEEK_K',
  [API_KEY_CONSTANTS.GROK]: 'GROK_K',
  [API_KEY_CONSTANTS.MOONSHOT]: 'MOONSHOT_K',
  [API_KEY_CONSTANTS.Z_AI]: 'Z_K',
  [API_KEY_CONSTANTS.FUGU]: 'FUGU_K',
  [API_KEY_CONSTANTS.QWEN]: 'GW_K',
  [API_KEY_CONSTANTS.MINIMAX]: 'MX_K',
  [API_KEY_CONSTANTS.META]: 'M_K',
};

/** Display names for grouping models by provider in pickers ("Anthropic", "Z.AI", …). */
export const PROVIDER_NAMES: Record<string, string> = SupportedAiKeyNames;

/** The catalog entry shape the UI renders: the library's ModelConfig keyed by picker id. */
export interface ModelConfig {
  /** Stable catalog id — game docs reference this, never the raw API model name. */
  id: string;
  displayName: string;
  modelApiName: string;
  apiKeyName: string;
  hasThinking: boolean;
  tags?: ModelTag[];
}

/** Every model the library supports, in catalog order. Extend upstream, never here. */
export const SUPPORTED_MODELS: ModelConfig[] = Object.entries(SupportedAiModels).map(
  ([id, config]) => ({
    id,
    displayName: config.displayName,
    modelApiName: config.modelApiName,
    apiKeyName: config.apiKeyName,
    hasThinking: config.hasThinking,
    ...(config.tags ? { tags: config.tags } : {}),
  }),
);

/**
 * Model ids that game docs may still hold in Firestore but that are not library catalog ids,
 * mapped to their current equivalent. Poker's own catalog (pre-library) used short ids for a
 * few models; games persist a model id per bot and per GM, so those live on in old docs
 * until `scripts/migrate-model-ids.ts` rewrites them — and even after, for any doc written
 * before the migration ran.
 *
 * Every path that reads a persisted model id goes through `resolveModelId` (directly or via
 * getModelConfig / findModelConfig), not just agent creation: tier validation re-checks
 * every bot in a game, so one stale id would otherwise make the model picker unusable for
 * that whole game.
 */
const DEPRECATED_MODEL_MAP: Record<string, string> = {
  claude: LLM_CONSTANTS.CLAUDE_SONNET,
  gemini: LLM_CONSTANTS.GEMINI_PRO,
  deepseek: LLM_CONSTANTS.DEEPSEEK_PRO,
  qwen: LLM_CONSTANTS.QWEN_MAX,
  // Fugu Ultra was dropped upstream in ai-agents 0.19.1 (65-78s turns); Fugu Max is the only
  // Fugu left. Mistral Medium 3.5 was dropped in 0.21.0; Small is the library's suggested map.
  fugu: LLM_CONSTANTS.FUGU_MAX,
  'fugu-ultra': LLM_CONSTANTS.FUGU_MAX,
  'mistral-medium': LLM_CONSTANTS.MISTRAL_SMALL,
  // Qwen3.7 Plus was retired upstream 2026-08-30; the Flash entry is the cheap Qwen tier
  // that replaces it.
  'qwen-plus': LLM_CONSTANTS.QWEN_FLASH,
};

/** Maps a possibly-retired model id to its current catalog id; unknown ids pass through. */
export function resolveModelId(modelId: string): string {
  return DEPRECATED_MODEL_MAP[modelId] ?? modelId;
}

/** Catalog entry for a (possibly retired) model id, or undefined when unknown. */
export function findModelConfig(modelId: string): ModelConfig | undefined {
  const id = resolveModelId(modelId);
  return SUPPORTED_MODELS.find((m) => m.id === id);
}

export function getModelConfig(modelId: string): ModelConfig {
  const config = findModelConfig(modelId);
  if (!config) throw new Error(`Unknown model id: ${modelId}`);
  return config;
}

/** Speed is an ordered scale — "fast" filters must also admit very-fast models. */
export function modelIsFast(modelId: string): boolean {
  return libModelIsFast(resolveModelId(modelId));
}

/**
 * Story generation emits a whole game setup in one response — the scene plus a character
 * (name, gender, story, persona) per rival — so it gets more room than a betting turn (the
 * library default is 8192). Reasoning stays at each model's catalog default.
 */
export const STORY_MAX_OUTPUT_TOKENS = 16_384;

/** Applies the story-generation profile to a freshly created GM agent. */
export function configureStoryAgent(agent: AbstractAgent): void {
  agent.maxOutputTokens = STORY_MAX_OUTPUT_TOKENS;
}
