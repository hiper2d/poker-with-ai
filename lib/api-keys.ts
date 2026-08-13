/**
 * Server-only API key resolution. Deliberately NOT a 'use server' file — these functions
 * return raw key values and must never be invokable as server actions. Importing this
 * from client code fails at build time via the firebase-admin dependency.
 *
 * Every tier plays on platform keys (werewolf's post-refactor model): the shared
 * config/freeTierApiKeys doc that werewolf maintains, with env vars filling gaps for
 * local dev. The free/paid difference is limits and billing, never key routing.
 */
import type { ApiKeyMap, ApiKeyName } from '@/config/models';
import { ENV_KEY_FALLBACKS } from '@/config/models';
import { COLLECTIONS, db } from '@/lib/firebase/server';
import { coerceTier, type UserTier } from '@/models/user';

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

/** Resolve the user's tier and the platform keys everyone plays on. */
export async function getTierAndKeys(email: string): Promise<TierKeys> {
  const snapshot = await db.collection(COLLECTIONS.users).doc(email).get();
  const tier = coerceTier(snapshot.data()?.tier);
  const platform = await getFreeTierApiKeys();
  return { tier, apiKeys: { ...envKeys(), ...platform } };
}

export async function getApiKeysForUser(email: string): Promise<ApiKeyMap> {
  return (await getTierAndKeys(email)).apiKeys;
}
