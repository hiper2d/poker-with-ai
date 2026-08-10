/**
 * The single source of truth for which models a user may pick and how bot models are
 * dealt, per tier. Pure functions over config — importable from client components and
 * server actions alike (no secrets: it only ever sees key *names*, never values).
 *
 * Tiers:
 * - free: platform keys; price-banded model subset with per-game bot caps (config/tiers.ts).
 * - api:  the user's own keys; only models whose key they have provided.
 * - paid: platform keys; full catalog, billed with markup (balance flow not built yet).
 */
import type { ApiKeyMap } from '@/config/models';
import { SUPPORTED_MODELS } from '@/config/models';
import { getFreeTierPolicy } from '@/config/tiers';
import type { UserTier } from '@/models/user';

export const FREE_TIER_UNLIMITED = Number.POSITIVE_INFINITY;

function requireModel(modelId: string) {
  const config = SUPPORTED_MODELS.find((m) => m.id === modelId);
  if (!config) throw new Error(`Unsupported AI model: ${modelId}.`);
  return config;
}

/** Per-game usage cap for a model: FREE_TIER_UNLIMITED, 0 (not available), or the cap. */
export function getPerGameModelLimit(modelId: string, tier: UserTier): number {
  if (tier !== 'free') return FREE_TIER_UNLIMITED;
  requireModel(modelId);
  const policy = getFreeTierPolicy(modelId);
  if (!policy.available || policy.maxBotsPerGame === 0) return 0;
  return policy.maxBotsPerGame === -1 ? FREE_TIER_UNLIMITED : policy.maxBotsPerGame;
}

export function getCandidateModelIdsForTier(tier: UserTier): string[] {
  if (tier !== 'free') return SUPPORTED_MODELS.map((m) => m.id);
  return SUPPORTED_MODELS.filter((m) => getFreeTierPolicy(m.id).available).map((m) => m.id);
}

/** Key names with a non-empty value. Server-side helper — clients get names, not maps. */
export function getProvidedApiKeyNames(apiKeys: ApiKeyMap | null | undefined): Set<string> {
  const provided = new Set<string>();
  for (const [name, value] of Object.entries(apiKeys ?? {})) {
    if (typeof value === 'string' && value.trim() !== '') provided.add(name);
  }
  return provided;
}

/** Models the user may actually select given tier and (api tier only) provided key names. */
export function getSelectableModelIds(
  tier: UserTier,
  providedKeyNames: ReadonlySet<string>,
): string[] {
  const candidates = getCandidateModelIdsForTier(tier);
  if (tier !== 'api') return candidates;
  return candidates.filter((id) => providedKeyNames.has(requireModel(id).apiKeyName));
}

/** Display-ready picker entry. Pickers map this to UI and never re-implement tier rules. */
export interface ModelPickerOption {
  id: string;
  disabled: boolean;
  suffix?: string;
}

/**
 * What every model picker shows.
 * - free: full catalog with capacity suffixes; unavailable models disabled (visible so the
 *   user sees what upgrading unlocks).
 * - api: only models whose key is provided.
 * - paid: full catalog.
 */
export function getModelPickerOptions(
  tier: UserTier,
  providedKeyNames: ReadonlySet<string>,
): ModelPickerOption[] {
  if (tier !== 'free') {
    return getSelectableModelIds(tier, providedKeyNames).map((id) => ({ id, disabled: false }));
  }
  return SUPPORTED_MODELS.map((m) => {
    const limit = getPerGameModelLimit(m.id, 'free');
    if (limit === 0) return { id: m.id, disabled: true, suffix: '(not on free tier)' };
    if (limit === FREE_TIER_UNLIMITED) return { id: m.id, disabled: false, suffix: '(unlimited)' };
    return { id: m.id, disabled: false, suffix: `(${limit}× per game)` };
  });
}

/**
 * Total bot slots a selection of models can cover on the given tier (the GM seat consumes
 * one slot of its model on the free tier — pass gmModelId to account for it).
 */
export function deckCapacity(modelIds: string[], tier: UserTier, gmModelId?: string): number {
  if (tier !== 'free') return FREE_TIER_UNLIMITED;
  let total = 0;
  for (const id of new Set(modelIds)) {
    let limit = getPerGameModelLimit(id, tier);
    if (limit === FREE_TIER_UNLIMITED) return FREE_TIER_UNLIMITED;
    if (gmModelId === id) limit = Math.max(0, limit - 1);
    total += limit;
  }
  return total;
}

/**
 * Deals bot models from the selected deck, shuffled, respecting free-tier per-model caps
 * (cycling freely on other tiers). Throws when free-tier capacity can't cover botCount.
 */
export function dealModels(
  modelIds: string[],
  botCount: number,
  tier: UserTier,
  gmModelId?: string,
): string[] {
  if (modelIds.length === 0) throw new Error('Select at least one bot model');
  const deck = [...new Set(modelIds)].sort(() => Math.random() - 0.5);

  if (tier !== 'free') {
    return Array.from({ length: botCount }, (_, i) => deck[i % deck.length]);
  }

  const remaining = new Map<string, number>();
  for (const id of deck) {
    let limit = getPerGameModelLimit(id, tier);
    if (gmModelId === id && limit !== FREE_TIER_UNLIMITED) limit = Math.max(0, limit - 1);
    remaining.set(id, limit);
  }
  const dealt: string[] = [];
  while (dealt.length < botCount) {
    const next = deck.find((id) => (remaining.get(id) ?? 0) > 0);
    if (!next) {
      throw new Error(
        `Selected models can cover only ${dealt.length} of ${botCount} bots on the free tier. Add more models.`,
      );
    }
    dealt.push(next);
    remaining.set(next, (remaining.get(next) ?? 0) - 1);
    // Rotate so limited models interleave instead of clustering on one character.
    deck.push(deck.shift()!);
  }
  return dealt.sort(() => Math.random() - 0.5);
}

/**
 * Server-side gate before persisting a game. Throws a descriptive error when the tier
 * doesn't allow the GM + bot model combination.
 */
export function validateModelUsageForTier(
  tier: UserTier,
  gmModelId: string,
  botModelIds: string[],
  providedKeyNames: ReadonlySet<string>,
): void {
  const all = [gmModelId, ...botModelIds];
  for (const id of all) requireModel(id);

  if (tier === 'api') {
    for (const id of all) {
      const config = requireModel(id);
      if (!providedKeyNames.has(config.apiKeyName)) {
        throw new Error(
          `${config.displayName} requires the ${config.apiKeyName} key. Add it on your Profile page.`,
        );
      }
    }
    return;
  }
  if (tier !== 'free') return; // paid: full catalog on platform keys

  const usage = new Map<string, number>();
  for (const [context, id] of [
    ['as the game master', gmModelId] as const,
    ...botModelIds.map((id) => ['for bots', id] as const),
  ]) {
    const limit = getPerGameModelLimit(id, tier);
    if (limit === 0)
      throw new Error(`${requireModel(id).displayName} is not available on the free tier ${context}.`);
    const used = (usage.get(id) ?? 0) + 1;
    if (used > limit) {
      const times = limit === 1 ? 'once' : `${limit} times`;
      throw new Error(
        `${requireModel(id).displayName} can only be used ${times} per game on the free tier.`,
      );
    }
    usage.set(id, used);
  }
}
