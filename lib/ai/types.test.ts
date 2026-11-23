import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { BettingDecisionSchema, ChatRoutingSchema, CompactionSchema } from './types';

// The OpenAI agent in @hiper2d/ai-agents sends schemas through the SDK's strict structured-output
// helper, which throws before any request on a field that is `.optional()` without `.nullable()`.
// That stopped every gpt-* bot's betting turn in production (2026-11), so check with the same helper.
const agentsRequire = createRequire(createRequire(import.meta.url).resolve('@hiper2d/ai-agents'));
const { zodTextFormat } = agentsRequire('openai/helpers/zod');

describe('structured output schemas', () => {
  it.each([
    ['BettingDecisionSchema', BettingDecisionSchema],
    ['ChatRoutingSchema', ChatRoutingSchema],
    ['CompactionSchema', CompactionSchema],
  ])('%s is accepted by OpenAI strict structured outputs', (_name, schema) => {
    expect(() => zodTextFormat(schema, 'response_schema')).not.toThrow();
  });

  it('accepts a null or missing amount and tableTalk', () => {
    expect(BettingDecisionSchema.parse({ action: 'fold', amount: null, reasoning: 'r', tableTalk: null }).amount).toBeNull();
    expect(BettingDecisionSchema.parse({ action: 'check', reasoning: 'r' }).tableTalk).toBeUndefined();
  });
});
