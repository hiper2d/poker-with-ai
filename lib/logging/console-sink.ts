import type { LogEvent, LogSink } from './types';

export class ConsoleSink implements LogSink {
  emit(event: LogEvent): void {
    const line = `[${event.level.toUpperCase()}] ${event.message}`;
    const args = event.context ? [line, event.context] : [line];
    if (event.level === 'error') console.error(...args);
    else if (event.level === 'warn') console.warn(...args);
    else console.log(...args);
  }
}
