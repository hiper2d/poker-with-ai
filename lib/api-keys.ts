/**
 * Server-only API key resolution. Deliberately NOT a 'use server' file — these functions
 * return raw key values and must never be invokable as server actions. Importing this
 * from client code fails at build time via the firebase-admin dependency.
 *
 * Key routing by tier:
 * - api:        the user's own keys (poker_users doc), env *_K vars filling gaps (dev).
 * - free/paid:  platform keys from the config/freeTierApiKeys doc — the same document
 *               werewolf maintains (both apps share the `config` collection and the
 *               same *_API_KEY names). Env vars fill gaps for local dev.
 */
import type { ApiKeyMap, ApiKeyName } from '@/config/models';
import { ENV_KEY_FALLBACKS } from '@/config/models';
import { COLLECTIONS, db } from '@/lib/firebase/server';
import type { PokerUser, UserTier } from '@/models/user';

function envKeys(): ApiKeyMap {
  const keys: ApiKeyMap = {};
  for (const [keyName, envVar] of Object.entries(ENV_KEY_FALLBACKS)) {
    const value = process.env[envVar];
    if (value) keys[keyName as ApiKeyName] = value;
  }
  return keys;
}

/** Platform keys shared with werewolf via the config collection. */
export async function getFreeTierApiKeys(): Promise<ApiKeyMap> {
  const snapshot = await db.collection(COLLECTIONS.config).doc('freeTierApiKeys').get();
  return ((snapshot.data()?.keys ?? {}) as ApiKeyMap) || {};
}

export interface TierKeys {
  tier: UserTier;
  apiKeys: ApiKeyMap;
}

/** Reads the user doc once and resolves both tier and the keys that tier plays on. */
export async function getTierAndKeys(email: string): Promise<TierKeys> {
  const snapshot = await db.collection(COLLECTIONS.users).doc(email).get();
  const user = snapshot.data() as PokerUser | undefined;
  const tier: UserTier = user?.tier ?? 'api';

  if (tier === 'api') {
    return { tier, apiKeys: { ...envKeys(), ...(user?.apiKeys ?? {}) } };
  }
  const platform = await getFreeTierApiKeys();
  return { tier, apiKeys: { ...envKeys(), ...platform } };
}

export async function getApiKeysForUser(email: string): Promise<ApiKeyMap> {
  return (await getTierAndKeys(email)).apiKeys;
}
