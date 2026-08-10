import { Logtail } from '@logtail/node';
import type { LogEvent, LogSink } from './types';

/** Ships events to BetterStack (Logtail). Requires LOGTAIL_SOURCE_TOKEN (+ optional host). */
export class BetterStackSink implements LogSink {
  private client: Logtail;

  constructor(sourceToken: string, ingestingHost?: string) {
    this.client = new Logtail(
      sourceToken,
      ingestingHost ? { endpoint: `https://${ingestingHost}` } : undefined,
    );
  }

  async emit(event: LogEvent): Promise<void> {
    try {
      await this.client.log(event.message, event.level, event.context ?? {});
    } catch {
      // sinks must never propagate failures into game actions
    }
  }

  async flush(): Promise<void> {
    await this.client.flush();
  }
}
