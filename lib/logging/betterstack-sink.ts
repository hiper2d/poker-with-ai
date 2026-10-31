import { Logtail } from '@logtail/node';
import type { LogEvent, LogSink } from './types';

/**
 * Ships events to BetterStack (Logtail). Requires LOGTAIL_SOURCE_TOKEN (+ optional host).
 *
 * Every line carries two tags the monitoring side filters on (Marlow's
 * monitor_betterstack reads the source back through the ClickHouse SQL API and
 * alerts only on `env = 'production'`): `env` — Vercel sets VERCEL_ENV to
 * production/preview/development, a laptop only has NODE_ENV — and `app`, so the
 * two games are told apart even if their lines ever land in one source. Console
 * output is left untouched so local logs don't grow a noisy `{ env, app }`.
 */
export class BetterStackSink implements LogSink {
  private client: Logtail;
  private readonly tags = {
    app: 'poker',
    env: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
  };

  constructor(sourceToken: string, ingestingHost?: string) {
    this.client = new Logtail(
      sourceToken,
      ingestingHost ? { endpoint: `https://${ingestingHost}` } : undefined,
    );
  }

  async emit(event: LogEvent): Promise<void> {
    try {
      await this.client.log(event.message, event.level, { ...this.tags, ...event.context });
    } catch {
      // sinks must never propagate failures into game actions
    }
  }

  async flush(): Promise<void> {
    await this.client.flush();
  }
}
