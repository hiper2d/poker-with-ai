import type { z } from 'zod';
import { logger } from '@/lib/logging/logger';
import type { AgentReply, AiMessage } from './types';

/**
 * Template-method base for all vendor agents (werewolf's AbstractAgent, slimmed).
 * Subclasses implement doAskText / doAskWithSchema; the base owns timing + logging.
 */
export abstract class AbstractAgent {
  constructor(
    public readonly botName: string,
    protected readonly systemPrompt: string,
    protected readonly modelApiName: string,
    protected readonly enableThinking: boolean,
  ) {}

  async askText(messages: AiMessage[]): Promise<AgentReply> {
    return this.timed(() => this.doAskText(messages));
  }

  async askWithSchema<T>(schema: z.ZodType<T>, messages: AiMessage[]): Promise<AgentReply<T>> {
    try {
      return await this.timed(() => this.doAskWithSchema(schema, messages));
    } catch (error) {
      if (!isValidationError(error)) throw error;
      // One repair attempt: re-ask with the validation error appended to the last user turn.
      const note = `\n\nIMPORTANT: your previous response failed schema validation:\n${String(error)}\nRespond again with a complete JSON object matching the schema exactly — every required field must be present.`;
      const retryMessages = messages.map((m, i) =>
        i === messages.length - 1 && m.role === 'user' ? { ...m, content: m.content + note } : m,
      );
      return this.timed(() => this.doAskWithSchema(schema, retryMessages));
    }
  }

  protected abstract doAskText(messages: AiMessage[]): Promise<Omit<AgentReply, 'durationMs'>>;
  protected abstract doAskWithSchema<T>(
    schema: z.ZodType<T>,
    messages: AiMessage[],
  ): Promise<Omit<AgentReply<T>, 'durationMs'>>;

  private async timed<T>(fn: () => Promise<Omit<AgentReply<T>, 'durationMs'>>): Promise<AgentReply<T>> {
    const started = Date.now();
    const log = logger.with({ bot: this.botName, model: this.modelApiName });
    try {
      const reply = await fn();
      const durationMs = Date.now() - started;
      log.info('agent reply', { durationMs, usage: reply.usage });
      return { ...reply, durationMs };
    } catch (error) {
      log.error('agent call failed', { error: String(error), durationMs: Date.now() - started });
      throw error;
    }
  }

  // TODO(skeleton): port from werewolf — prepareMessages (merge consecutive user turns)
  // and CACHE_TIER_MARKER prompt-cache tiering (shared rules tier + per-bot tier).
}

/** Zod validation or JSON parse failures are worth one repair retry; API errors are not. */
function isValidationError(error: unknown): boolean {
  return (
    error instanceof SyntaxError ||
    (error instanceof Error && error.name === 'ZodError')
  );
}
