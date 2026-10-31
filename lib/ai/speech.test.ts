import { describe, expect, it } from 'vitest';
import { speechOf } from './speech';

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
