import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { AbstractAgent } from './abstract-agent';
import type { AgentReply, AiMessage, TokenUsage } from './types';

export class GoogleAgent extends AbstractAgent {
  private client: GoogleGenAI;

  constructor(
    botName: string,
    systemPrompt: string,
    modelApiName: string,
    apiKey: string,
    enableThinking: boolean,
    private maxOutputTokens: number,
  ) {
    super(botName, systemPrompt, modelApiName, enableThinking);
    this.client = new GoogleGenAI({ apiKey });
  }

  protected async doAskText(messages: AiMessage[]): Promise<Omit<AgentReply, 'durationMs'>> {
    const response = await this.client.models.generateContent({
      model: this.modelApiName,
      contents: toContents(messages),
      config: { systemInstruction: this.systemPrompt, maxOutputTokens: this.maxOutputTokens },
    });
    return { content: response.text ?? '', usage: toUsage(response.usageMetadata) };
  }

  protected async doAskWithSchema<T>(
    schema: z.ZodType<T>,
    messages: AiMessage[],
  ): Promise<Omit<AgentReply<T>, 'durationMs'>> {
    const response = await this.client.models.generateContent({
      model: this.modelApiName,
      contents: toContents(messages),
      config: {
        systemInstruction: this.systemPrompt,
        maxOutputTokens: this.maxOutputTokens,
        responseMimeType: 'application/json',
        responseJsonSchema: z.toJSONSchema(schema),
      },
    });
    if (!response.text) throw new Error('Google returned empty content');
    return { content: schema.parse(JSON.parse(response.text)), usage: toUsage(response.usageMetadata) };
  }
}

function toContents(messages: AiMessage[]) {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
    parts: [{ text: m.content }],
  }));
}

function toUsage(meta?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }): TokenUsage | undefined {
  if (!meta) return undefined;
  return {
    inputTokens: meta.promptTokenCount ?? 0,
    outputTokens: (meta.candidatesTokenCount ?? 0) + (meta.thoughtsTokenCount ?? 0),
    reasoningTokens: meta.thoughtsTokenCount,
  };
}
