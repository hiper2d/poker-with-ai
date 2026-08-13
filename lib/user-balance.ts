/**
 * Server-only balance and spending ops on poker_users docs. Deliberately NOT a
 * 'use server' file — addBalance/deductBalance move money and must never be invokable
 * as server actions from the client (werewolf exposes them as actions; that's a hole
 * we don't copy). Server actions and the Stripe webhook import from here.
 */
import { COLLECTIONS, db } from '@/lib/firebase/server';
import { applySpending, formatPeriod } from '@/lib/spending';
import { USER_TIERS, type UserTier } from '@/models/user';

const to6dp = (n: number): number => parseFloat((Number(n) || 0).toFixed(6));

export async function getUserBalance(email: string): Promise<number> {
  const snapshot = await db.collection(COLLECTIONS.users).doc(email).get();
  return Number(snapshot.data()?.balance) || 0;
}

/**
 * Credit the balance. Adding funds is an explicit opt-in to paid usage: a free-tier
 * (or legacy-tier) user who tops up is switched to paid in the same transaction —
 * otherwise the top-up only raises a number while free-tier rules keep applying.
 */
export async function addBalance(email: string, amountUsd: number): Promise<void> {
  if (!(amountUsd > 0)) throw new Error('Amount must be positive');
  const userRef = db.collection(COLLECTIONS.users).doc(email);
  await db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) throw new Error(`User ${email} not found`);
    const data = userSnap.data();
    const update: { balance: number; tier?: UserTier } = {
      balance: to6dp((Number(data?.balance) || 0) + amountUsd),
    };
    if (data?.tier !== USER_TIERS.PAID) update.tier = USER_TIERS.PAID;
    transaction.update(userRef, update);
  });
}

/**
 * Debit the balance if it covers the amount. Returns false (without writing) when it
 * doesn't — the caller decides whether that's a hard error.
 */
export async function deductBalance(email: string, amountUsd: number): Promise<boolean> {
  if (!(amountUsd > 0)) return true;
  const userRef = db.collection(COLLECTIONS.users).doc(email);
  let success = false;
  await db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) return;
    const currentBalance = Number(userSnap.data()?.balance) || 0;
    if (currentBalance < amountUsd) return;
    transaction.update(userRef, { balance: to6dp(currentBalance - amountUsd) });
    success = true;
  });
  return success;
}

/**
 * Credit the balance exactly once per Stripe event. The event claim, the credit and the
 * free→paid upgrade commit in ONE transaction — a get-then-set idempotency check leaves
 * a window where two concurrent deliveries of the same event both read "not processed"
 * and both credit (it happened: two `stripe listen` forwarders on one endpoint).
 * Returns false when the event was already processed.
 */
export async function creditBalanceOnce(
  eventId: string,
  email: string,
  amountUsd: number,
  meta: Record<string, unknown> = {},
): Promise<boolean> {
  if (!(amountUsd > 0)) throw new Error('Amount must be positive');
  const eventRef = db.collection(COLLECTIONS.stripeEvents).doc(eventId);
  const userRef = db.collection(COLLECTIONS.users).doc(email);
  let credited = false;
  await db.runTransaction(async (transaction) => {
    credited = false;
    const [eventSnap, userSnap] = await Promise.all([
      transaction.get(eventRef),
      transaction.get(userRef),
    ]);
    if (eventSnap.exists) return; // already processed — a retry or a duplicate delivery
    if (!userSnap.exists) throw new Error(`User ${email} not found`);
    const data = userSnap.data();
    const update: { balance: number; tier?: UserTier } = {
      balance: to6dp((Number(data?.balance) || 0) + amountUsd),
    };
    if (data?.tier !== USER_TIERS.PAID) update.tier = USER_TIERS.PAID;
    transaction.update(userRef, update);
    transaction.set(eventRef, {
      userId: email,
      amountUsd,
      ...meta,
      processedAt: new Date().toISOString(),
    });
    credited = true;
  });
  return credited;
}

/** Record spend in the user's monthly history (no balance change). */
export async function updateUserMonthlySpending(
  email: string,
  amountUsd: number,
  tier: UserTier,
  timestamp: number = Date.now(),
): Promise<void> {
  const amount = to6dp(amountUsd);
  if (!(amount > 0)) return;
  const period = formatPeriod(timestamp);
  const userRef = db.collection(COLLECTIONS.users).doc(email);
  await db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    const spendings = applySpending(userSnap.data()?.spendings, period, amount, tier);
    if (userSnap.exists) {
      transaction.update(userRef, { spendings });
    } else {
      transaction.set(userRef, { spendings }, { merge: true });
    }
  });
}

export async function setStripeCustomerId(email: string, stripeCustomerId: string): Promise<void> {
  await db.collection(COLLECTIONS.users).doc(email).update({ stripeCustomerId });
}
