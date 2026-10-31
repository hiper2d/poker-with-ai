/**
 * Adapter that routes @hiper2d/ai-agents' logging through the app logger, so agent
 * request/response records reach BetterStack alongside everything else. The truncation
 * rules follow the library's AgentLoggingConfig (LOG_* env vars), mirroring werewolf.
 */
import {
  DEFAULT_LOGGING_CONFIG,
  type AgentActivityData,
  type AgentLoggingConfig,
  type LlmLogger,
} from '@hiper2d/ai-agents';
import { logger } from './logger';

function clip(text: string, max: number): string {
  return max === -1 || text.length <= max ? text : `${text.slice(0, max)}...`;
}

/** The library passes free-form args; the app logger wants a context map. */
function toContext(args: unknown): Record<string, unknown> | undefined {
  if (args === undefined || args === null) return undefined;
  if (typeof args === 'object' && !Array.isArray(args)) return args as Record<string, unknown>;
  return { args };
}

function agentActivity(
  agentName: string,
  model: string,
  activity: string,
  data: AgentActivityData,
  customConfig?: AgentLoggingConfig,
): void {
  const config = customConfig ?? DEFAULT_LOGGING_CONFIG.agents;
  if (!config.enabled) return;

  const ctx: Record<string, unknown> = { agentName, model, activity };
  if (data.gameId) ctx.gameId = data.gameId;
  if (data.userId) ctx.userId = data.userId;
  if (config.logSystemPrompt && data.systemPrompt) ctx.systemPrompt = data.systemPrompt;
  if (config.history.enabled && data.history) {
    ctx.history = data.history.map((m) => ({
      role: m.role,
      content: clip(m.content, config.history.maxCharactersPerMessage),
    }));
  }
  if (config.logCommand && data.command) ctx.command = data.command;
  if (data.reply !== undefined) {
    const reply: Record<string, unknown> = {};
    if (config.reply.mode === 'body-only') {
      const body = typeof data.reply === 'string' ? data.reply : JSON.stringify(data.reply);
      reply.body = clip(body, config.reply.maxReplyChars);
    } else {
      reply.raw = data.reply;
    }
    if (config.reply.includeReasoning && data.thinking) {
      reply.thinking = clip(data.thinking, config.reply.maxThinkingChars);
    }
    if (config.reply.includeUsage && data.usage) reply.usage = data.usage;
    ctx.reply = reply;
  }
  logger.info(`agent ${activity.toLowerCase()}`, ctx);
}

export const llmLogger: LlmLogger = {
  debug: (message, args) => logger.debug(message, toContext(args)),
  info: (message, args) => logger.info(message, toContext(args)),
  warn: (message, args) => logger.warn(message, toContext(args)),
  error: (message, args) => logger.error(message, toContext(args)),
  agentActivity,
};
