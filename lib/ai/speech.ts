import { cleanResponse, extractFirstJsonObject } from '@hiper2d/ai-agents';

/**
 * Chat replies come from askText, and a model occasionally answers with a fenced
 * betting-decision JSON instead of speech. Never put raw JSON on the table: salvage the
 * speakable field if there is one, and stay silent otherwise — `reasoning` is private
 * and must not leak into chat.
 */
export function speechOf(raw: string): string {
  const cleaned = cleanResponse(raw);
  if (cleaned.startsWith('"')) {
    try {
      const unquoted = JSON.parse(cleaned);
      if (typeof unquoted === 'string') return unquoted.trim();
    } catch {
      // not a quoted JSON string — fall through
    }
  }
  if (!cleaned.startsWith('{')) return cleaned;
  const parsed = extractFirstJsonObject(cleaned);
  if (parsed && typeof parsed === 'object') {
    for (const key of ['tableTalk', 'reply', 'speech', 'message', 'text'] as const) {
      const value = (parsed as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return ''; // JSON with nothing speakable — silence beats leaking it
  }
  return cleaned;
}
