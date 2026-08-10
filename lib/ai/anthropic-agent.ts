import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { AbstractAgent } from './abstract-agent';
import type { AgentReply, AiMessage, TokenUsage } from './types';

export class AnthropicAgent extends AbstractAgent {
  private client: Anthropic;

  constructor(
    botName: string,
    systemPrompt: string,
    modelApiName: string,
    apiKey: string,
    enableThinking: boolean,
    private maxOutputTokens: number,
  ) {
    super(botName, systemPrompt, modelApiName, enableThinking);
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Anthropic only caches behind explicit breakpoints (unlike OpenAI/Gemini/DeepSeek's
   * automatic prefix caching). The system prompt — persona, story, memory — is stable
   * between a bot's calls, so one ephemeral block gives cache hits across its decisions
   * and chat replies. Prompts under the model's cacheable minimum are silently uncached.
   */
  private cachedSystem(): Anthropic.TextBlockParam[] {
    return [{ type: 'text', text: this.systemPrompt, cache_control: { type: 'ephemeral' } }];
  }

  protected async doAskText(messages: AiMessage[]): Promise<Omit<AgentReply, 'durationMs'>> {
    const response = await this.client.messages.create({
      model: this.modelApiName,
      max_tokens: this.maxOutputTokens,
      system: this.cachedSystem(),
      messages,
    });
    const content = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    return { content, usage: toUsage(response.usage) };
  }

  protected async doAskWithSchema<T>(
    schema: z.ZodType<T>,
    messages: AiMessage[],
  ): Promise<Omit<AgentReply<T>, 'durationMs'>> {
    const response = await this.client.messages.create({
      model: this.modelApiName,
      max_tokens: this.maxOutputTokens,
      system: this.cachedSystem(),
      messages,
      tools: [
        {
          name: 'respond',
          description: 'Provide your structured response',
          input_schema: z.toJSONSchema(schema) as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: 'respond' },
    });
    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );
    if (!toolUse) throw new Error('Anthropic returned no tool_use block');
    return { content: schema.parse(toolUse.input), usage: toUsage(response.usage) };
  }
}

function toUsage(usage: Anthropic.Usage): TokenUsage {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cachedInputTokens: usage.cache_read_input_tokens ?? undefined,
  };
}
