import type { ApiKeyMap } from '@/config/models';
import { getModelConfig } from '@/config/models';
import type { AbstractAgent } from './abstract-agent';
import { AnthropicAgent } from './anthropic-agent';
import { GoogleAgent } from './google-agent';
import { OpenAiAgent } from './openai-agent';

/** Creates the right vendor agent for a model id from config/models.ts. */
export function createAgent(
  botName: string,
  systemPrompt: string,
  modelId: string,
  apiKeys: ApiKeyMap,
  enableThinking = false,
): AbstractAgent {
  const config = getModelConfig(modelId);
  const apiKey = apiKeys[config.apiKeyName];
  if (!apiKey) throw new Error(`Missing ${config.apiKeyName} for model ${modelId}`);

  switch (config.agentKind) {
    case 'anthropic':
      return new AnthropicAgent(botName, systemPrompt, config.modelApiName, apiKey, enableThinking, config.maxOutputTokens);
    case 'openai':
    case 'openai-compatible':
      return new OpenAiAgent(
        botName,
        systemPrompt,
        config.modelApiName,
        apiKey,
        enableThinking,
        config.maxOutputTokens,
        config.baseUrl,
        config.structuredMode,
      );
    case 'google':
      return new GoogleAgent(botName, systemPrompt, config.modelApiName, apiKey, enableThinking, config.maxOutputTokens);
    case 'mistral':
      throw new Error('Mistral agent not ported yet');
  }
}
