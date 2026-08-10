'use server';

import { auth } from '@/auth';
import type { ApiKeyName } from '@/config/models';
import { ENV_KEY_FALLBACKS } from '@/config/models';
import { COLLECTIONS, db } from '@/lib/firebase/server';
import type { PokerUser, UserProfile, UserTier } from '@/models/user';

async function requireEmail(): Promise<string> {
  const session = await auth();
  if (!session?.user?.email) throw new Error('Not authenticated');
  return session.user.email;
}

export async function upsertUser(email: string, name: string | null): Promise<void> {
  const ref = db.collection(COLLECTIONS.users).doc(email);
  const snapshot = await ref.get();
  if (snapshot.exists) {
    await ref.update({ name });
  } else {
    const user: PokerUser = { email, name, tier: 'api', apiKeys: {}, createdAt: Date.now() };
    await ref.set(user);
  }
}

export async function getUserProfile(): Promise<UserProfile> {
  const email = await requireEmail();
  const snapshot = await db.collection(COLLECTIONS.users).doc(email).get();
  const user = (snapshot.data() as PokerUser | undefined) ?? {
    email,
    name: null,
    tier: 'api' as const,
    apiKeys: {},
    createdAt: Date.now(),
  };
  return {
    email: user.email,
    name: user.name,
    tier: user.tier,
    apiKeys: Object.entries(user.apiKeys).map(([name, value]) => ({
      name,
      masked: `••••${value.slice(-4)}`,
    })),
  };
}

export async function setApiKey(name: ApiKeyName, value: string): Promise<UserProfile> {
  const email = await requireEmail();
  if (!value.trim()) throw new Error('Empty API key');
  await db
    .collection(COLLECTIONS.users)
    .doc(email)
    .set({ apiKeys: { [name]: value.trim() } }, { merge: true });
  return getUserProfile();
}

export async function deleteApiKey(name: ApiKeyName): Promise<UserProfile> {
  const email = await requireEmail();
  const ref = db.collection(COLLECTIONS.users).doc(email);
  const snapshot = await ref.get();
  const apiKeys = { ...((snapshot.data() as PokerUser | undefined)?.apiKeys ?? {}) };
  delete apiKeys[name];
  await ref.update({ apiKeys });
  return getUserProfile();
}

/** Self-service tier switch. Paid needs the balance flow (Stripe) — not built yet. */
export async function updateUserTier(tier: UserTier): Promise<UserProfile> {
  const email = await requireEmail();
  if (tier === 'paid') throw new Error('The paid tier is coming soon.');
  if (tier !== 'free' && tier !== 'api') throw new Error(`Unknown tier: ${tier}`);
  await db.collection(COLLECTIONS.users).doc(email).set({ tier }, { merge: true });
  return getUserProfile();
}

export interface ModelAccess {
  tier: UserTier;
  /** api tier only: key NAMES (never values) the user can play on, env fallbacks included. */
  providedKeyNames: ApiKeyName[];
}

/** Client-safe view for model pickers: tier + which provider keys are available. */
export async function getModelAccess(): Promise<ModelAccess> {
  const email = await requireEmail();
  const snapshot = await db.collection(COLLECTIONS.users).doc(email).get();
  const user = snapshot.data() as PokerUser | undefined;
  const tier = user?.tier ?? 'api';
  if (tier !== 'api') return { tier, providedKeyNames: [] };

  const provided = new Set<ApiKeyName>();
  for (const [keyName, envVar] of Object.entries(ENV_KEY_FALLBACKS)) {
    const userValue = user?.apiKeys?.[keyName];
    if ((typeof userValue === 'string' && userValue.trim() !== '') || process.env[envVar]) {
      provided.add(keyName as ApiKeyName);
    }
  }
  return { tier, providedKeyNames: [...provided] };
}
