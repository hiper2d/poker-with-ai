import OpenAI from 'openai';
import { z } from 'zod';
import { AbstractAgent } from './abstract-agent';
import type { AgentReply, AiMessage, TokenUsage } from './types';

export class OpenAiAgent extends AbstractAgent {
  private client: OpenAI;

  constructor(
    botName: string,
    systemPrompt: string,
    modelApiName: string,
    apiKey: string,
    enableThinking: boolean,
    private maxOutputTokens: number,
    baseUrl?: string,
    private structuredMode: 'json_schema' | 'json_object' = 'json_schema',
  ) {
    super(botName, systemPrompt, modelApiName, enableThinking);
    this.client = new OpenAI({ apiKey, baseURL: baseUrl });
  }

  protected async doAskText(messages: AiMessage[]): Promise<Omit<AgentReply, 'durationMs'>> {
    const response = await this.client.chat.completions.create({
      model: this.modelApiName,
      max_completion_tokens: this.maxOutputTokens,
      messages: [{ role: 'system' as const, content: this.systemPrompt }, ...messages],
    });
    return {
      content: response.choices[0]?.message?.content ?? '',
      usage: toUsage(response.usage),
    };
  }

  protected async doAskWithSchema<T>(
    schema: z.ZodType<T>,
    messages: AiMessage[],
  ): Promise<Omit<AgentReply<T>, 'durationMs'>> {
    const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
    // Vendors without native structured outputs get the schema in the prompt + json_object mode.
    const chatMessages =
      this.structuredMode === 'json_object'
        ? [
            { role: 'system' as const, content: this.systemPrompt },
            ...messages.slice(0, -1),
            {
              role: 'user' as const,
              content: `${messages[messages.length - 1]?.content ?? ''}\n\nRespond ONLY with a JSON object matching this JSON Schema:\n${JSON.stringify(jsonSchema)}`,
            },
          ]
        : [{ role: 'system' as const, content: this.systemPrompt }, ...messages];

    const response = await this.client.chat.completions.create({
      model: this.modelApiName,
      max_completion_tokens: this.maxOutputTokens,
      messages: chatMessages,
      response_format:
        this.structuredMode === 'json_object'
          ? { type: 'json_object' }
          : { type: 'json_schema', json_schema: { name: 'response', schema: jsonSchema } },
    });
    const raw = response.choices[0]?.message?.content;
    if (!raw) throw new Error('OpenAI returned empty content');
    return { content: schema.parse(JSON.parse(raw)), usage: toUsage(response.usage) };
  }
}

function toUsage(usage?: OpenAI.CompletionUsage): TokenUsage | undefined {
  if (!usage) return undefined;
  return {
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    cachedInputTokens: usage.prompt_tokens_details?.cached_tokens,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens,
  };
}
