import { describe, expect, it } from 'vitest';
import { applySpending, formatPeriod, getSpendForPeriod, normalizeSpendings } from './spending';

describe('formatPeriod', () => {
  it('formats UTC year-month', () => {
    expect(formatPeriod(Date.UTC(2026, 7, 12))).toBe('2026-08');
    expect(formatPeriod(Date.UTC(2026, 0, 1))).toBe('2026-01');
  });
});

describe('applySpending', () => {
  it('creates a period record with the tier bucket', () => {
    const result = applySpending(undefined, '2026-08', 0.5, 'paid');
    expect(result).toEqual([
      { period: '2026-08', amountUsd: 0.5, freeAmountUsd: 0, paidAmountUsd: 0.5 },
    ]);
  });

  it('accumulates into an existing period and keeps newest first', () => {
    const start = applySpending(undefined, '2026-07', 1, 'free');
    const withNew = applySpending(start, '2026-08', 0.25, 'free');
    const result = applySpending(withNew, '2026-08', 0.25, 'paid');
    expect(result.map((r) => r.period)).toEqual(['2026-08', '2026-07']);
    expect(result[0]).toEqual({
      period: '2026-08',
      amountUsd: 0.5,
      freeAmountUsd: 0.25,
      paidAmountUsd: 0.25,
    });
  });

  it('keeps sub-cent amounts at 6dp instead of rounding them away', () => {
    const result = applySpending(undefined, '2026-08', 0.000123, 'paid');
    expect(result[0].amountUsd).toBe(0.000123);
  });

  it('ignores zero and negative amounts', () => {
    expect(applySpending(undefined, '2026-08', 0, 'free')).toEqual([]);
    expect(applySpending(undefined, '2026-08', -1, 'free')).toEqual([]);
  });
});

describe('normalizeSpendings', () => {
  it('drops malformed entries and coerces numbers', () => {
    const result = normalizeSpendings([
      { period: '2026-08', amountUsd: '0.5' },
      { amountUsd: 1 }, // no period — dropped
      null,
    ]);
    expect(result).toEqual([
      { period: '2026-08', amountUsd: 0.5, freeAmountUsd: 0, paidAmountUsd: 0 },
    ]);
  });
});

describe('getSpendForPeriod', () => {
  it('returns the period total or zero', () => {
    const spendings = applySpending(undefined, '2026-08', 2.5, 'paid');
    expect(getSpendForPeriod(spendings, '2026-08')).toBe(2.5);
    expect(getSpendForPeriod(spendings, '2026-07')).toBe(0);
    expect(getSpendForPeriod(undefined, '2026-08')).toBe(0);
  });
});
