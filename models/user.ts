/**
 * Two tiers, werewolf's scheme exactly:
 * - free: platform keys, price-banded model subset, per-game bot caps, daily game limit.
 * - paid: platform keys, full catalog, cost + markup deducted from a prepaid balance.
 * Legacy 'api' (bring-your-own-keys) docs still exist in Firestore; anything that isn't
 * 'paid' reads as free (see coerceTier), same as werewolf handles its retired tier.
 */
export type UserTier = 'free' | 'paid';

export const USER_TIERS = {
  FREE: 'free' as const,
  PAID: 'paid' as const,
};

/** Coerce a stored tier string — including the retired 'api' — to a live tier. */
export function coerceTier(raw: unknown): UserTier {
  return raw === USER_TIERS.PAID ? USER_TIERS.PAID : USER_TIERS.FREE;
}

/** One month's recorded platform spend, keyed by UTC "YYYY-MM". */
export interface UserMonthlySpending {
  period: string;
  /** Total across tiers — free records what the platform paid, paid records what was billed. */
  amountUsd: number;
  freeAmountUsd?: number;
  paidAmountUsd?: number;
}

export interface PokerUser {
  email: string;
  name: string | null;
  tier: UserTier;
  /** USD prepaid balance — the paid tier bills model cost + markup against it. */
  balance?: number;
  spendings?: UserMonthlySpending[];
  stripeCustomerId?: string;
  createdAt: number;
}

/** Client-safe view for the profile page. */
export interface UserProfile {
  email: string;
  name: string | null;
  tier: UserTier;
  balance: number;
  /** What this month's play cost so far (billed amount for paid, platform cost for free). */
  monthlySpendUsd: number;
}
