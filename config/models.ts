/**
 * AI model catalog — availability, API names, capabilities. Pricing lives in config/pricing.ts.
 * Full port of werewolf's ai-models.ts catalog; extend by adding entries, never by editing agents.
 */
export type ApiKeyName =
  | 'ANTHROPIC_API_KEY'
  | 'OPENAI_API_KEY'
  | 'GOOGLE_API_KEY'
  | 'MISTRAL_API_KEY'
  | 'DEEPSEEK_API_KEY'
  | 'GROK_API_KEY'
  | 'MOONSHOT_API_KEY'
  | 'Z_AI_API_KEY'
  | 'FUGU_API_KEY'
  | 'QWEN_API_KEY'
  | 'MINIMAX_API_KEY';

export type ApiKeyMap = Partial<Record<ApiKeyName, string>>;

/**
 * Dev/local fallback: when a key is missing from poker_users/{email}.apiKeys, it is read
 * from these env vars (same naming convention as werewolf's .env).
 */
export const ENV_KEY_FALLBACKS: Record<ApiKeyName, string> = {
  ANTHROPIC_API_KEY: 'ANTHROPIC_K',
  OPENAI_API_KEY: 'OPENAI_K',
  GOOGLE_API_KEY: 'GOOGLE_K',
  MISTRAL_API_KEY: 'MISTRAL_K',
  DEEPSEEK_API_KEY: 'DEEP_SEEK_K',
  GROK_API_KEY: 'GROK_K',
  MOONSHOT_API_KEY: 'MOONSHOT_K',
  Z_AI_API_KEY: 'Z_K',
  FUGU_API_KEY: 'FUGU_K',
  QWEN_API_KEY: 'GW_K',
  MINIMAX_API_KEY: 'MX_K',
};

/** Display names for grouping models by provider in pickers. */
export const PROVIDER_NAMES: Record<ApiKeyName, string> = {
  ANTHROPIC_API_KEY: 'Anthropic',
  OPENAI_API_KEY: 'OpenAI',
  GOOGLE_API_KEY: 'Google',
  MISTRAL_API_KEY: 'Mistral',
  DEEPSEEK_API_KEY: 'DeepSeek',
  GROK_API_KEY: 'Grok',
  MOONSHOT_API_KEY: 'Moonshot',
  Z_AI_API_KEY: 'Z.AI',
  FUGU_API_KEY: 'Sakana Fugu',
  QWEN_API_KEY: 'Qwen',
  MINIMAX_API_KEY: 'MiniMax',
};

export type AgentKind = 'anthropic' | 'openai' | 'google' | 'mistral' | 'openai-compatible';

/** Speed/cost hints shown in the model picker (werewolf's tag vocabulary). */
export type ModelTag =
  | 'very-fast'
  | 'fast'
  | 'slow'
  | 'very-slow'
  | 'extremely-slow'
  | 'cheap'
  | 'expensive';

export interface ModelConfig {
  /** Stable picker id — game docs reference this, never the raw API model name. */
  id: string;
  displayName: string;
  agentKind: AgentKind;
  modelApiName: string;
  apiKeyName: ApiKeyName;
  baseUrl?: string; // for openai-compatible vendors
  hasThinking: boolean;
  maxOutputTokens: number;
  /**
   * How structured output is requested for openai/openai-compatible agents:
   * json_schema (native structured outputs) or json_object (schema injected into the prompt).
   */
  structuredMode?: 'json_schema' | 'json_object';
  tags?: ModelTag[];
}

/**
 * Ids 'claude', 'gpt', 'gemini', 'deepseek', 'qwen', 'fugu' predate the full catalog port
 * and stay as-is (persisted game docs reference them); every other id matches werewolf's.
 */
export const SUPPORTED_MODELS: ModelConfig[] = [
  // Anthropic
  {
    id: 'claude-fable',
    displayName: 'Claude Fable 5',
    agentKind: 'anthropic',
    modelApiName: 'claude-fable-5',
    apiKeyName: 'ANTHROPIC_API_KEY',
    hasThinking: true,
    maxOutputTokens: 16_384,
    tags: ['expensive'],
  },
  {
    id: 'claude-opus',
    displayName: 'Claude 5 Opus',
    agentKind: 'anthropic',
    modelApiName: 'claude-opus-5',
    apiKeyName: 'ANTHROPIC_API_KEY',
    hasThinking: true,
    maxOutputTokens: 16_384,
    tags: ['expensive'],
  },
  {
    id: 'claude',
    displayName: 'Claude 5 Sonnet',
    agentKind: 'anthropic',
    modelApiName: 'claude-sonnet-5',
    apiKeyName: 'ANTHROPIC_API_KEY',
    hasThinking: true,
    maxOutputTokens: 16_384,
    tags: ['expensive'],
  },
  {
    id: 'claude-haiku',
    displayName: 'Claude 4.5 Haiku',
    agentKind: 'anthropic',
    modelApiName: 'claude-haiku-4-5',
    apiKeyName: 'ANTHROPIC_API_KEY',
    hasThinking: true,
    maxOutputTokens: 16_384,
    tags: ['slow', 'cheap'],
  },
  // OpenAI
  {
    id: 'gpt-sol',
    displayName: 'GPT-5.6 Sol',
    agentKind: 'openai',
    modelApiName: 'gpt-5.6-sol',
    apiKeyName: 'OPENAI_API_KEY',
    hasThinking: true,
    maxOutputTokens: 16_384,
    structuredMode: 'json_schema',
    tags: ['expensive'],
  },
  {
    id: 'gpt',
    displayName: 'GPT-5.6 Terra',
    agentKind: 'openai',
    modelApiName: 'gpt-5.6-terra',
    apiKeyName: 'OPENAI_API_KEY',
    hasThinking: true,
    maxOutputTokens: 16_384,
    structuredMode: 'json_schema',
    tags: ['fast', 'expensive'],
  },
  {
    id: 'gpt-mini',
    displayName: 'GPT-5.6 Luna',
    agentKind: 'openai',
    modelApiName: 'gpt-5.6-luna',
    apiKeyName: 'OPENAI_API_KEY',
    hasThinking: true,
    maxOutputTokens: 16_384,
    structuredMode: 'json_schema',
    tags: ['fast', 'cheap'],
  },
  // Google
  {
    id: 'gemini',
    displayName: 'Gemini 3.1 Pro Preview',
    agentKind: 'google',
    modelApiName: 'gemini-3.1-pro-preview',
    apiKeyName: 'GOOGLE_API_KEY',
    hasThinking: true,
    maxOutputTokens: 16_384,
    tags: ['expensive'],
  },
  {
    id: 'gemini-flash',
    displayName: 'Gemini 3.6 Flash',
    agentKind: 'google',
    modelApiName: 'gemini-3.6-flash',
    apiKeyName: 'GOOGLE_API_KEY',
    hasThinking: true,
    maxOutputTokens: 16_384,
    tags: ['fast'],
  },
  {
    id: 'gemini-lite',
    displayName: 'Gemini 3.5 Flash Lite',
    agentKind: 'google',
    modelApiName: 'gemini-3.5-flash-lite',
    apiKeyName: 'GOOGLE_API_KEY',
    hasThinking: true,
    maxOutputTokens: 16_384,
    tags: ['fast', 'cheap'],
  },
  // DeepSeek
  {
    id: 'deepseek-flash',
    displayName: 'DeepSeek V4 Flash',
    agentKind: 'openai-compatible',
    modelApiName: 'deepseek-v4-flash',
    apiKeyName: 'DEEPSEEK_API_KEY',
    baseUrl: 'https://api.deepseek.com',
    hasThinking: true,
    maxOutputTokens: 8_192,
    structuredMode: 'json_object',
    tags: ['cheap'],
  },
  {
    id: 'deepseek',
    displayName: 'DeepSeek V4 Pro',
    agentKind: 'openai-compatible',
    modelApiName: 'deepseek-v4-pro',
    apiKeyName: 'DEEPSEEK_API_KEY',
    baseUrl: 'https://api.deepseek.com',
    hasThinking: true,
    maxOutputTokens: 8_192,
    structuredMode: 'json_object',
    tags: ['cheap'],
  },
  // Grok
  {
    id: 'grok',
    displayName: 'Grok 4.5',
    agentKind: 'openai-compatible',
    modelApiName: 'grok-4.5',
    apiKeyName: 'GROK_API_KEY',
    baseUrl: 'https://api.x.ai/v1',
    hasThinking: true,
    maxOutputTokens: 16_384,
    structuredMode: 'json_schema',
  },
  // Mistral — served through the OpenAI-compatible endpoint for now; a dedicated SDK
  // agent (werewolf has one) can replace agentKind without touching the catalog.
  {
    id: 'mistral-large',
    displayName: 'Mistral Large 3',
    agentKind: 'openai-compatible',
    modelApiName: 'mistral-large-latest',
    apiKeyName: 'MISTRAL_API_KEY',
    baseUrl: 'https://api.mistral.ai/v1',
    hasThinking: false,
    maxOutputTokens: 8_192,
    structuredMode: 'json_object',
    tags: ['fast'],
  },
  {
    id: 'mistral-medium',
    displayName: 'Mistral Medium 3.5',
    agentKind: 'openai-compatible',
    modelApiName: 'mistral-medium-3',
    apiKeyName: 'MISTRAL_API_KEY',
    baseUrl: 'https://api.mistral.ai/v1',
    hasThinking: false,
    maxOutputTokens: 8_192,
    structuredMode: 'json_object',
    tags: ['very-fast', 'expensive'],
  },
  {
    id: 'mistral-small',
    displayName: 'Mistral 4 Small',
    agentKind: 'openai-compatible',
    modelApiName: 'mistral-small-latest',
    apiKeyName: 'MISTRAL_API_KEY',
    baseUrl: 'https://api.mistral.ai/v1',
    hasThinking: false,
    maxOutputTokens: 8_192,
    structuredMode: 'json_object',
    tags: ['very-fast', 'cheap'],
  },
  {
    id: 'mistral-magistral',
    displayName: 'Magistral Medium 1.2',
    agentKind: 'openai-compatible',
    modelApiName: 'magistral-medium-latest',
    apiKeyName: 'MISTRAL_API_KEY',
    baseUrl: 'https://api.mistral.ai/v1',
    hasThinking: true,
    maxOutputTokens: 8_192,
    structuredMode: 'json_object',
    tags: ['very-fast'],
  },
  // Moonshot
  {
    id: 'kimi',
    displayName: 'Kimi K3',
    agentKind: 'openai-compatible',
    modelApiName: 'kimi-k3',
    apiKeyName: 'MOONSHOT_API_KEY',
    baseUrl: 'https://api.moonshot.ai/v1',
    hasThinking: true,
    maxOutputTokens: 8_192,
    structuredMode: 'json_object',
    tags: ['very-slow', 'expensive'],
  },
  // Z.AI
  {
    id: 'glm',
    displayName: 'GLM-5.2',
    agentKind: 'openai-compatible',
    modelApiName: 'glm-5.2',
    apiKeyName: 'Z_AI_API_KEY',
    baseUrl: 'https://api.z.ai/api/paas/v4/',
    hasThinking: true,
    maxOutputTokens: 8_192,
    structuredMode: 'json_object',
    tags: ['slow'],
  },
  // Qwen
  {
    id: 'qwen',
    displayName: 'Qwen3.8 Max',
    agentKind: 'openai-compatible',
    modelApiName: 'qwen3.8-max',
    apiKeyName: 'QWEN_API_KEY',
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    hasThinking: true,
    maxOutputTokens: 8_192,
    structuredMode: 'json_object',
    tags: ['very-slow'],
  },
  {
    id: 'qwen-plus',
    displayName: 'Qwen3.7 Plus',
    agentKind: 'openai-compatible',
    modelApiName: 'qwen3.7-plus',
    apiKeyName: 'QWEN_API_KEY',
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    hasThinking: true,
    maxOutputTokens: 8_192,
    structuredMode: 'json_object',
    tags: ['slow', 'cheap'],
  },
  {
    id: 'qwen-flash',
    displayName: 'Qwen3.7 Flash',
    agentKind: 'openai-compatible',
    modelApiName: 'qwen3.7-flash',
    apiKeyName: 'QWEN_API_KEY',
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    hasThinking: true,
    maxOutputTokens: 8_192,
    structuredMode: 'json_object',
    tags: ['slow', 'cheap'],
  },
  // MiniMax
  {
    id: 'minimax',
    displayName: 'MiniMax M3',
    agentKind: 'openai-compatible',
    modelApiName: 'MiniMax-M3',
    apiKeyName: 'MINIMAX_API_KEY',
    baseUrl: 'https://api.minimax.io/v1',
    hasThinking: true,
    maxOutputTokens: 8_192,
    structuredMode: 'json_object',
    tags: ['very-slow', 'cheap'],
  },
  // Sakana
  {
    id: 'fugu',
    displayName: 'Sakana Fugu Ultra',
    agentKind: 'openai-compatible',
    modelApiName: 'fugu-ultra',
    apiKeyName: 'FUGU_API_KEY',
    baseUrl: 'https://api.sakana.ai/v1',
    hasThinking: false,
    maxOutputTokens: 8_192,
    structuredMode: 'json_object',
    tags: ['extremely-slow', 'expensive'],
  },
];

export const RANDOM_MODEL_ID = 'random';

export function getModelConfig(id: string): ModelConfig {
  const config = SUPPORTED_MODELS.find((m) => m.id === id);
  if (!config) throw new Error(`Unknown model id: ${id}`);
  return config;
}

/** Speed is an ordered scale — "fast" filters must also admit very-fast models. */
export function modelIsFast(id: string): boolean {
  const tags = SUPPORTED_MODELS.find((m) => m.id === id)?.tags ?? [];
  return tags.includes('fast') || tags.includes('very-fast');
}
