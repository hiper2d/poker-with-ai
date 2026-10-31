import { AgentFactory, setLlmLogger, type AbstractAgent } from '@hiper2d/ai-agents';
import { ENV_KEY_FALLBACKS, getModelConfig, type ApiKeyMap, type ApiKeyName } from '@/config/models';
import { llmLogger } from '@/lib/logging/llm-logger';

// Route the library's agent-activity logging through the app's logging pipeline.
// Module-load side effect: every agent-creation path goes through this factory, so the
// logger is always wired before the first agent logs.
setLlmLogger(llmLogger);

export interface AgentContext {
  /** Stamped on the agent so the library's request/response logs carry the game. */
  gameId?: string;
  /** The paying user, for the same logs. */
  userId?: string;
}

/**
 * Poker's agent factory: resolves deprecated persisted model ids (an app concern) and fails
 * fast on a missing platform key, then delegates to the library factory for the vendor
 * agent itself. The vendor mechanics — request shape, structured output, thinking, lenient
 * JSON parsing, token usage and cost — all live in @hiper2d/ai-agents.
 */
export function createAgent(
  botName: string,
  systemPrompt: string,
  modelId: string,
  apiKeys: ApiKeyMap,
  context: AgentContext = {},
): AbstractAgent {
  const config = getModelConfig(modelId);
  if (!apiKeys[config.apiKeyName]) {
    const envVar = ENV_KEY_FALLBACKS[config.apiKeyName as ApiKeyName];
    throw new Error(`Missing ${config.apiKeyName} for model ${config.id} (env ${envVar})`);
  }
  const agent = AgentFactory.createAgent(botName, systemPrompt, config.id, apiKeys);
  agent.gameId = context.gameId;
  agent.userId = context.userId;
  return agent;
}
