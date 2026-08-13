import { describe, expect, it } from 'vitest';
import { extractFirstJsonObject, parseAndValidateLlmJson, speechOf } from './json-response-parser';
import { BettingDecisionSchema, ChatRoutingSchema } from './types';

describe('extractFirstJsonObject', () => {
  it('extracts a bare object', () => {
    expect(extractFirstJsonObject('{"a": 1}')).toEqual({ a: 1 });
  });

  it('extracts an object embedded in prose', () => {
    expect(extractFirstJsonObject('Sure! Here is my answer: {"a": 1} hope it helps')).toEqual({
      a: 1,
    });
  });

  it('handles braces inside string values', () => {
    expect(extractFirstJsonObject('prefix {"reply": "smile :} and {wave}"} suffix')).toEqual({
      reply: 'smile :} and {wave}',
    });
  });

  it('handles escaped quotes inside strings', () => {
    expect(extractFirstJsonObject('x {"reply": "he said \\"hi {there}\\""} y')).toEqual({
      reply: 'he said "hi {there}"',
    });
  });

  it('skips an unparseable candidate and finds a later object', () => {
    expect(extractFirstJsonObject('{not json} but {"a": 2} works')).toEqual({ a: 2 });
  });

  it('returns null when there is no object', () => {
    expect(extractFirstJsonObject('no json here')).toBeNull();
  });

  it('returns null for truncated JSON', () => {
    expect(extractFirstJsonObject('{"reply": "cut off mid-')).toBeNull();
  });
});

describe('parseAndValidateLlmJson', () => {
  const decision = { action: 'call', reasoning: 'pot odds are fine' };

  it('parses strict valid JSON', () => {
    expect(parseAndValidateLlmJson(JSON.stringify(decision), BettingDecisionSchema)).toEqual(
      decision,
    );
  });

  it('parses fenced JSON', () => {
    expect(
      parseAndValidateLlmJson('```json\n' + JSON.stringify(decision) + '\n```', BettingDecisionSchema),
    ).toEqual(decision);
  });

  it('recovers JSON wrapped in prose (Grok prose-preamble case)', () => {
    const raw = `Alright, let me think... ${JSON.stringify(decision)} — final answer.`;
    expect(parseAndValidateLlmJson(raw, BettingDecisionSchema)).toEqual(decision);
  });

  it('unwraps a JSON string wrapped in quotes (Gemini quirk)', () => {
    const raw = '"{\\"action\\": \\"call\\", \\"reasoning\\": \\"pot odds are fine\\"}"';
    expect(parseAndValidateLlmJson(raw, BettingDecisionSchema)).toEqual(decision);
  });

  it('re-braces an object body missing both outer braces (MiniMax-M3 case)', () => {
    const raw = '"action": "fold",\n  "reasoning": "Vex\'s raise smells like a made hand"';
    expect(parseAndValidateLlmJson(raw, BettingDecisionSchema)).toEqual({
      action: 'fold',
      reasoning: "Vex's raise smells like a made hand",
    });
  });

  it('re-braces an object body missing only the opening brace', () => {
    const raw = '"action": "check", "reasoning": "kept the closing brace"}';
    expect(parseAndValidateLlmJson(raw, BettingDecisionSchema)).toEqual({
      action: 'check',
      reasoning: 'kept the closing brace',
    });
  });

  it('throws a parse error for plain prose', () => {
    expect(() => parseAndValidateLlmJson('just prose, no json', BettingDecisionSchema)).toThrow(
      /Failed to parse JSON response/,
    );
  });

  it('throws a validation error for valid JSON of the wrong shape', () => {
    expect(() => parseAndValidateLlmJson('{"action": 42}', BettingDecisionSchema)).toThrow(
      /Response validation failed/,
    );
  });

  it('throws a parse error for truncated JSON (DeepSeek truncation case)', () => {
    expect(() =>
      parseAndValidateLlmJson('{"action": "call", "reasoning": "because he', BettingDecisionSchema),
    ).toThrow(/Failed to parse JSON response/);
  });

  it('reports recoveries through the log callback', () => {
    const logs: string[] = [];
    parseAndValidateLlmJson(
      'preamble {"reasoning": "quiet table", "speakers": []}',
      ChatRoutingSchema,
      (m) => logs.push(m),
    );
    expect(logs.some((m) => m.includes('Recovered JSON'))).toBe(true);
  });
});

describe('speechOf', () => {
  it('passes plain speech through', () => {
    expect(speechOf('Nice bluff, Vex.')).toBe('Nice bluff, Vex.');
  });

  it('salvages tableTalk from a leaked fenced betting decision, never the reasoning', () => {
    const raw =
      '```json { "action": "fold", "amount": 0, "reasoning": "my cards are trash", "tableTalk": "Save the dramatics, Bellatrix." } ```';
    expect(speechOf(raw)).toBe('Save the dramatics, Bellatrix.');
  });

  it('salvages a reply field', () => {
    expect(speechOf('{"reply": "Deal me in."}')).toBe('Deal me in.');
  });

  it('goes silent on JSON with nothing speakable rather than leaking it', () => {
    expect(speechOf('{"action": "call", "reasoning": "pot odds"}')).toBe('');
  });

  it('unwraps a quoted JSON string', () => {
    expect(speechOf('"Read \'em and weep."')).toBe("Read 'em and weep.");
  });

  it('keeps prose that merely starts with a quote character', () => {
    expect(speechOf('"Luck" is just skill in disguise.')).toBe('"Luck" is just skill in disguise.');
  });
});
