'use server';

import { FieldValue } from 'firebase-admin/firestore';
import { auth } from '@/auth';
import { COLLECTIONS, db } from '@/lib/firebase/server';
import { formatPeriod, getSpendForPeriod } from '@/lib/spending';
import { USER_TIERS, coerceTier, type PokerUser, type UserProfile, type UserTier } from '@/models/user';

async function requireEmail(): Promise<string> {
  const session = await auth();
  if (!session?.user?.email) throw new Error('Not authenticated');
  return session.user.email;
}

export async function upsertUser(email: string, name: string | null): Promise<void> {
  const ref = db.collection(COLLECTIONS.users).doc(email);
  const snapshot = await ref.get();
  if (snapshot.exists) {
    const stored = snapshot.data() as Partial<PokerUser> & { apiKeys?: unknown };
    const update: Record<string, unknown> = { name };
    // Legacy cleanup (the retired 'api' tier): normalize the tier and drop stored keys —
    // everyone plays on platform keys now, so user keys must not linger in Firestore.
    if (stored.tier !== USER_TIERS.FREE && stored.tier !== USER_TIERS.PAID) {
      update.tier = USER_TIERS.FREE;
    }
    if (stored.apiKeys !== undefined) update.apiKeys = FieldValue.delete();
    await ref.update(update);
  } else {
    const user: PokerUser = { email, name, tier: 'free', createdAt: Date.now() };
    await ref.set(user);
  }
}

export async function getUserProfile(): Promise<UserProfile> {
  const email = await requireEmail();
  const snapshot = await db.collection(COLLECTIONS.users).doc(email).get();
  const user = snapshot.data() as Partial<PokerUser> | undefined;
  return {
    email,
    name: user?.name ?? null,
    tier: coerceTier(user?.tier),
    balance: Number(user?.balance) || 0,
    monthlySpendUsd: getSpendForPeriod(user?.spendings, formatPeriod(Date.now())),
  };
}

/**
 * Self-service tier switch. Both directions are free to take: the paid tier is gated on
 * balance at game creation, not here (topping up switches to paid on its own — see
 * addBalance).
 */
export async function updateUserTier(tier: UserTier): Promise<UserProfile> {
  const email = await requireEmail();
  if (tier !== USER_TIERS.FREE && tier !== USER_TIERS.PAID) throw new Error(`Unknown tier: ${tier}`);
  await db.collection(COLLECTIONS.users).doc(email).set({ tier }, { merge: true });
  return getUserProfile();
}

export interface ModelAccess {
  tier: UserTier;
}

/** Client-safe view for model pickers. */
export async function getModelAccess(): Promise<ModelAccess> {
  const email = await requireEmail();
  const snapshot = await db.collection(COLLECTIONS.users).doc(email).get();
  return { tier: coerceTier(snapshot.data()?.tier) };
}

/**
 * Games created since 00:00 UTC today — the free tier's daily-limit counter, exposed for
 * the profile page. Filtered in memory over the owner's games (same as listGames) to
 * avoid needing a composite index on poker_games.
 */
export async function getGamesCreatedTodayCount(): Promise<number> {
  const email = await requireEmail();
  const startOfTodayUTC = new Date();
  startOfTodayUTC.setUTCHours(0, 0, 0, 0);
  const snapshot = await db.collection(COLLECTIONS.games).where('createdBy', '==', email).get();
  return snapshot.docs.filter((d) => (d.data().createdAt ?? 0) >= startOfTodayUTC.getTime()).length;
}
