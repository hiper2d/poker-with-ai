/**
 * Monthly-spending reducers — pure functions ported from werewolf's spending-utils, shared
 * by the atomic charge transaction and the standalone spending update so the merge logic
 * lives in exactly one tested place. Poker never had werewolf's legacy 'api' spend bucket,
 * so it isn't modeled here.
 *
 * All money is 6dp: 2dp rounding silently swallowed werewolf's sub-cent charges (single
 * cheap bot calls), making paid usage effectively free.
 */
import type { UserMonthlySpending, UserTier } from '@/models/user';

/** Format a UTC timestamp into the `YYYY-MM` period key used for monthly spending. */
export function formatPeriod(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

const to6dp = (n: number): number => parseFloat((Number(n) || 0).toFixed(6));

/**
 * Pure reducer: add `amountUsd` to the spending record for `period` (creating it if
 * absent) and to the tier-specific bucket, returning a fresh, newest-first array.
 */
export function applySpending(
  spendings: unknown[] | undefined,
  period: string,
  amountUsd: number,
  tier: UserTier,
): UserMonthlySpending[] {
  const current = normalizeSpendings(spendings);
  const amount = to6dp(amountUsd);
  if (!(amount > 0)) return current;

  let periodUpdated = false;
  const updated = current.map((record) => {
    if (record.period !== period) return record;
    periodUpdated = true;
    return {
      period: record.period,
      amountUsd: to6dp(record.amountUsd + amount),
      freeAmountUsd: to6dp((record.freeAmountUsd ?? 0) + (tier === 'free' ? amount : 0)),
      paidAmountUsd: to6dp((record.paidAmountUsd ?? 0) + (tier === 'paid' ? amount : 0)),
    };
  });

  if (!periodUpdated) {
    updated.push({
      period,
      amountUsd: amount,
      freeAmountUsd: tier === 'free' ? amount : 0,
      paidAmountUsd: tier === 'paid' ? amount : 0,
    });
  }

  updated.sort((a, b) => b.period.localeCompare(a.period));
  return updated;
}

/** Total spend recorded for `period` (YYYY-MM), or 0 if none. */
export function getSpendForPeriod(spendings: unknown[] | undefined, period: string): number {
  const record = normalizeSpendings(spendings).find((r) => r.period === period);
  return record?.amountUsd ?? 0;
}

/** Drop malformed entries and coerce numbers — Firestore data is not to be trusted. */
export function normalizeSpendings(spendings: unknown[] | undefined): UserMonthlySpending[] {
  if (!Array.isArray(spendings)) return [];
  return spendings
    .map((record): UserMonthlySpending | null => {
      const r = record as Record<string, unknown>;
      const period = typeof r?.period === 'string' ? r.period : '';
      if (!period) return null;
      return {
        period,
        amountUsd: to6dp(Number(r?.amountUsd)),
        freeAmountUsd: to6dp(Number(r?.freeAmountUsd)),
        paidAmountUsd: to6dp(Number(r?.paidAmountUsd)),
      };
    })
    .filter((record): record is UserMonthlySpending => record !== null)
    .sort((a, b) => b.period.localeCompare(a.period));
}
