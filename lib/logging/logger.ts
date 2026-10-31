import { after } from 'next/server';
import { BetterStackSink } from './betterstack-sink';
import { ConsoleSink } from './console-sink';
import type { LogEvent, LogLevel, LogSink } from './types';

/**
 * BetterStack batches uploads (~1s), but Vercel freezes the function once the
 * response is sent — undelivered batches would be lost. `after()` keeps the
 * invocation alive until the sink's delivery promise settles.
 */
function keepAliveUntilDelivered(delivery: Promise<void> | void) {
  if (!delivery) return;
  const safe = delivery.catch(() => {});
  try {
    after(() => safe);
  } catch {
    // outside a request scope (tests, scripts) — fire and forget
  }
}

/** Fan-out logger: every event goes to all configured sinks. */
export class Logger {
  constructor(
    private sinks: LogSink[],
    private base: Record<string, unknown> = {},
  ) {}

  /** Child logger with extra bound context (e.g. gameId, actor). */
  with(context: Record<string, unknown>): Logger {
    return new Logger(this.sinks, { ...this.base, ...context });
  }

  debug = (msg: string, ctx?: Record<string, unknown>) => this.log('debug', msg, ctx);
  info = (msg: string, ctx?: Record<string, unknown>) => this.log('info', msg, ctx);
  warn = (msg: string, ctx?: Record<string, unknown>) => this.log('warn', msg, ctx);
  error = (msg: string, ctx?: Record<string, unknown>) => this.log('error', msg, ctx);

  private log(level: LogLevel, message: string, context?: Record<string, unknown>) {
    const event: LogEvent = {
      level,
      message,
      context: { ...this.base, ...context },
      timestamp: Date.now(),
    };
    for (const sink of this.sinks) keepAliveUntilDelivered(sink.emit(event));
  }
}

function buildSinks(): LogSink[] {
  const sinks: LogSink[] = [new ConsoleSink()];
  if (process.env.LOGTAIL_SOURCE_TOKEN) {
    sinks.push(
      new BetterStackSink(process.env.LOGTAIL_SOURCE_TOKEN, process.env.LOGTAIL_INGESTING_HOST),
    );
  }
  return sinks;
}

export const logger = new Logger(buildSinks());
