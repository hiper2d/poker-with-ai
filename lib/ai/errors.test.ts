import { describe, expect, it } from 'vitest';
import { isResponseFormatFailure } from './errors';

describe('isResponseFormatFailure', () => {
  it('matches the lenient parser failure messages', () => {
    expect(isResponseFormatFailure('Failed to parse JSON response: SyntaxError ...')).toBe(true);
    expect(isResponseFormatFailure('Response validation failed: invalid enum value')).toBe(true);
  });

  it('matches empty-content failures — the model produced nothing usable', () => {
    expect(isResponseFormatFailure('MiniMax returned empty content')).toBe(true);
    expect(isResponseFormatFailure('OpenAI returned empty content')).toBe(true);
  });

  it('rejects transport failures — nothing useful to tell the model', () => {
    expect(isResponseFormatFailure('connect ETIMEDOUT')).toBe(false);
    expect(isResponseFormatFailure('500 Internal Server Error')).toBe(false);
    expect(isResponseFormatFailure('429 rate limit exceeded')).toBe(false);
    expect(isResponseFormatFailure('')).toBe(false);
    expect(isResponseFormatFailure(null)).toBe(false);
  });
});
