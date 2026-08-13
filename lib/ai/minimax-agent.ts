import OpenAI from 'openai';
import { z } from 'zod';
import { logger } from '@/lib/logging/logger';
import { AbstractAgent } from './abstract-agent';
import { parseAndValidateLlmJson } from './json-response-parser';
import { toUsage } from './openai-agent';
import type { AgentReply, AiMessage } from './types';

// MiniMax M3 agent (werewolf's, slimmed). The API is OpenAI-compatible, so we use the OpenAI
// SDK with a custom baseURL. M3's `thinking` param is `{type: 'adaptive'}` by default (the
// model decides per-request how much to think) and `{type: 'disabled'}` turns it off.
//
// We always send `reasoning_split: true`: without it, thinking arrives as `<think>` tags INSIDE
// message.content and would poison JSON parsing; with it, thinking arrives separately in
// `message.reasoning_content`. We still strip stray <think> blocks from the answer defensively.
//
// Structured output: the M-series Chat Completions API has no `response_format` at all — sending
// one is not an option, so schema constraints are conveyed in-prompt and parsed leniently.
// MiniMax's Anthropic-compatible endpoint was evaluated as an alternative (forced tool_choice,
// arguments as a parsed object) and rejected: it removes JSON syntax errors but MiniMax does no
// constrained decoding, so required fields are still dropped (observed live in werewolf: story
// generation omitting a required field from all 15 players), and tool_choice is not always
// honored. It needs the same in-prompt schema description and the same lenient parsing, for a
// second client against a second endpoint.
export class MiniMaxAgent extends AbstractAgent {
  private client: OpenAI;

  constructor(
    botName: string,
    systemPrompt: string,
    modelApiName: string,
    apiKey: string,
    enableThinking: boolean,
    private maxOutputTokens: number,
    baseUrl?: string,
  ) {
    super(botName, systemPrompt, modelApiName, enableThinking);
    this.client = new OpenAI({ apiKey, baseURL: baseUrl ?? 'https://api.minimax.io/v1' });
  }

  private thinkingParams(): Record<string, unknown> {
    return {
      thinking: { type: this.enableThinking ? 'adaptive' : 'disabled' },
      reasoning_split: true,
    };
  }

  /** Defensive: with reasoning_split the content should be clean, but a stray <think> block
   *  in the answer would break JSON parsing and read badly in chat. */
  private stripThinkTags(text: string): string {
    return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }

  private async complete(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    return this.client.chat.completions.create({
      model: this.modelApiName,
      // MiniMax deprecates max_tokens in favor of max_completion_tokens.
      max_completion_tokens: this.maxOutputTokens,
      messages,
      ...this.thinkingParams(),
    } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming);
  }

  protected async doAskText(messages: AiMessage[]): Promise<Omit<AgentReply, 'durationMs'>> {
    const response = await this.complete([
      { role: 'system', content: this.systemPrompt },
      ...messages,
    ]);
    const message = response.choices[0]?.message;
    const content = this.stripThinkTags(message?.content ?? '');
    if (!content) throw new Error('MiniMax returned empty content');
    return { content, thinking: reasoningOf(message), usage: toUsage(response.usage) };
  }

  protected async doAskWithSchema<T>(
    schema: z.ZodType<T>,
    messages: AiMessage[],
  ): Promise<Omit<AgentReply<T>, 'durationMs'>> {
    const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
    const response = await this.complete([
      { role: 'system', content: this.systemPrompt },
      ...messages.slice(0, -1),
      {
        role: 'user',
        content:
          `${messages[messages.length - 1]?.content ?? ''}\n\nIMPORTANT: Respond with ONLY a ` +
          `valid JSON object matching this JSON Schema. Do NOT write narration, roleplay ` +
          `actions, asterisks, or commentary outside the JSON. Output the JSON object and ` +
          `nothing else.\n${JSON.stringify(jsonSchema)}`,
      },
    ]);
    const message = response.choices[0]?.message;
    const raw = this.stripThinkTags(message?.content ?? '');
    if (!raw) throw new Error('MiniMax returned empty content');
    const log = logger.with({ bot: this.botName, model: this.modelApiName });
    const content = parseAndValidateLlmJson(raw, schema, (m) => log.info(m));
    return { content, thinking: reasoningOf(message), usage: toUsage(response.usage) };
  }
}

/** With reasoning_split, thinking arrives in reasoning_content (absent from the SDK's types). */
function reasoningOf(message?: OpenAI.Chat.Completions.ChatCompletionMessage): string | undefined {
  const reasoning = (message as { reasoning_content?: string } | undefined)?.reasoning_content;
  return reasoning || undefined;
}
