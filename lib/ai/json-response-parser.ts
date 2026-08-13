import type { z } from 'zod';

/** Strip markdown code fences (```json ... ```) that models love to wrap JSON in. */
export function cleanResponse(response: string): string {
  let cleaned = response.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}

/**
 * Extract the first balanced JSON object embedded in `text`.
 * String- and escape-aware, so braces inside string values don't break the scan.
 * If the first candidate fails to parse, scanning continues from the next '{'.
 * Returns null when no parseable object is found.
 */
export function extractFirstJsonObject(text: string): unknown | null {
  let searchFrom = 0;
  while (true) {
    const start = text.indexOf('{', searchFrom);
    if (start < 0) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(text.slice(start, i + 1));
          } catch {
            break; // unbalanced-looking but unparseable — try the next '{'
          }
        }
      }
    }
    searchFrom = start + 1;
  }
}

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

/**
 * Lenient parse + Zod validation of an LLM text reply (werewolf's parser, minus the
 * BotAnswer-specific rescues — this game has no `{ reply }`-shaped schema to wrap prose into).
 *
 * Order of attempts:
 * 1. Strict JSON parse of the fence-stripped reply (plus a quote-unwrapped
 *    variant for Gemini's quoted-JSON-string quirk).
 * 2. Extraction of the first balanced JSON object embedded in prose
 *    (rescues "Sure, here is my answer: {...}" replies).
 * 3. Re-bracing replies that look like an object body missing its outer braces
 *    (rescues MiniMax-M3's `"action": "...", "reasoning": "..."` replies).
 *
 * Throws with werewolf's message prefixes ("Failed to parse JSON response:",
 * "Response validation failed:") — `isResponseFormatFailure` in errors.ts matches on them.
 */
export function parseAndValidateLlmJson<T>(
  rawReply: string,
  schema: z.ZodType<T>,
  log: (message: string) => void = () => {},
): T {
  const cleaned = cleanResponse(rawReply);

  const candidates: string[] = [cleaned];
  // Gemini sometimes returns the JSON string wrapped in quotes
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    candidates.push(cleaned.slice(1, -1).replace(/\\"/g, '"'));
  }

  let parseError: unknown = null;
  let zodError: z.ZodError | null = null;

  const tryValidate = (value: unknown): { data: T } | null => {
    const result = schema.safeParse(value);
    if (result.success) return { data: result.data };
    zodError = zodError ?? result.error;
    return null;
  };

  // 1. Strict parse
  for (const candidate of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch (error) {
      parseError = parseError ?? error;
      continue;
    }
    const validated = tryValidate(parsed);
    if (validated) return validated.data;
  }

  // 2. First balanced JSON object embedded in prose
  for (const candidate of candidates) {
    const extracted = extractFirstJsonObject(candidate);
    if (extracted === null) continue;
    const validated = tryValidate(extracted);
    if (validated) {
      log(`Recovered JSON embedded in prose response (${candidate.length} chars)`);
      return validated.data;
    }
  }

  // 3. Object body missing its outer braces: `"action": ...` → `{"action": ...}`.
  //    Also try adding only the opening brace, for replies that kept the closing one.
  for (const candidate of candidates) {
    if (!candidate.startsWith('"')) continue;
    for (const rebraced of [`{${candidate}}`, `{${candidate}`]) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rebraced);
      } catch {
        continue;
      }
      const validated = tryValidate(parsed);
      if (validated) {
        log(`Recovered JSON missing outer braces (${candidate.length} chars)`);
        return validated.data;
      }
    }
  }

  if (zodError !== null) {
    log(`Zod validation failed: ${JSON.stringify((zodError as z.ZodError).issues)}`);
    throw new Error(`Response validation failed: ${(zodError as z.ZodError).message}`);
  }
  throw new Error(
    `Failed to parse JSON response: ${parseError}. First 200 chars: ${cleaned.slice(0, 200)}`,
  );
}
