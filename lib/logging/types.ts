export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEvent {
  level: LogLevel;
  message: string;
  /** Structured payload — gameId, actor, model, durationMs, tokens, etc. */
  context?: Record<string, unknown>;
  timestamp: number;
}

/** One destination for log events. Implementations must never throw into callers. */
export interface LogSink {
  emit(event: LogEvent): void | Promise<void>;
  flush?(): Promise<void>;
}
