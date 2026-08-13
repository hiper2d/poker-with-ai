/**
 * Usage recording and billing — werewolf's cost-tracking ported to poker collections.
 * Server-only (NOT 'use server': these move money).
 *
 * One Firestore transaction commits the user charge, the monthly-spending record, the
 * game's accumulated cost and a per-request stat doc together, so stats and money can
 * never disagree:
 * - Billing keys off the user's CURRENT tier read inside the transaction, so an
 *   upgrade-to-paid bills even games created on the free tier.
 * - Paid tier pays model cost + markup; an insufficient balance throws BEFORE any
 *   write, so we never record a cost we didn't charge.
 * - Free tier is never charged; the platform's cost still lands in the monthly
 *   spending history and the stat doc.
 *
 * Callers pass the in-memory Game so its usage totals can be synced with what the
 * transaction committed — play-actions saves the whole game doc afterwards, and a stale
 * in-memory copy would clobber the transaction's writes.
 */
import { PAID_TIER_MARKUP, computeCostUsd } from '@/config/pricing';
import { SUPPORTED_MODELS } from '@/config/models';
import type { TokenUsage } from '@/lib/ai/types';
import { COLLECTIONS, db } from '@/lib/firebase/server';
import { applySpending, formatPeriod } from '@/lib/spending';
import type { Bot, Game, TokenUsageTotals } from '@/models/game';
import { USER_TIERS, coerceTier } from '@/models/user';

const to6dp = (n: number): number => parseFloat((Number(n) || 0).toFixed(6));

export interface UsageReport {
  usage?: TokenUsage;
  durationMs: number;
}

const REQUEST_STATS_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

interface StatContext {
  actor: 'bot' | 'gm';
  botName?: string;
}

function buildRequestStatDoc(
  gameId: string,
  userEmail: string,
  billedTier: string,
  modelId: string,
  context: StatContext,
  usage: TokenUsage,
  costUsd: number,
  durationMs: number,
  timestamp: number,
): Record<string, unknown> {
  const config = SUPPORTED_MODELS.find((m) => m.id === modelId);
  return {
    gameId,
    userId: userEmail,
    tier: billedTier,
    actor: context.actor,
    ...(context.botName ? { botName: context.botName } : {}),
    modelId,
    modelApiName: config?.modelApiName ?? modelId,
    apiKeyName: config?.apiKeyName ?? 'unknown',
    thinkingEnabled: config?.hasThinking ?? false,
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens ?? 0,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.reasoningTokens ?? 0,
    costUsd,
    durationMs,
    status: 'ok',
    createdAt: new Date(timestamp),
    expireAt: new Date(timestamp + REQUEST_STATS_TTL_MS),
  };
}

function addTotals(current: TokenUsageTotals | undefined, usage: TokenUsage, costUsd: number): TokenUsageTotals {
  return {
    inputTokens: (current?.inputTokens ?? 0) + usage.inputTokens,
    outputTokens: (current?.outputTokens ?? 0) + usage.outputTokens,
    costUsd: to6dp((current?.costUsd ?? 0) + costUsd),
  };
}

/**
 * Charge the user AND commit the game cost in a single transaction. `buildGameUpdate`
 * inspects the freshly-read game doc and returns the field map to write, or null to
 * abort cleanly (game/bot missing) without charging anything.
 */
async function commitUsageAtomically(
  game: Game,
  modelId: string,
  context: StatContext,
  report: UsageReport,
  buildGameUpdate: (fresh: Game) => Record<string, unknown> | null,
  syncInMemory: (game: Game, committed: Record<string, unknown>) => void,
): Promise<void> {
  const usage = report.usage;
  if (!usage) return;
  const costUsd = to6dp(computeCostUsd(modelId, usage));
  const timestamp = Date.now();

  const gameRef = db.collection(COLLECTIONS.games).doc(game.id);
  const userRef = db.collection(COLLECTIONS.users).doc(game.createdBy);
  // Pre-allocated so the write can join the transaction (refs can't be created inside).
  const statRef = db.collection(COLLECTIONS.requestStats).doc();

  let committedUpdate: Record<string, unknown> | null = null;
  await db.runTransaction(async (transaction) => {
    committedUpdate = null;
    // ---- all reads first (Firestore requires reads before writes) ----
    const gameSnap = await transaction.get(gameRef);
    if (!gameSnap.exists) return;
    const fresh = gameSnap.data() as Game;

    const gameUpdate = buildGameUpdate(fresh);
    if (!gameUpdate) return;

    const userSnap = await transaction.get(userRef);
    const userData = userSnap.data() ?? {};
    // Bills by the user's tier NOW, not the game's creation tier; a stray legacy tier
    // string (the retired 'api') bills as free so its spend lands in a bucket.
    const billedTier = coerceTier(userData.tier);

    let recordedAmount = costUsd;
    const userUpdate: Record<string, unknown> = {};
    if (billedTier === USER_TIERS.PAID && costUsd > 0) {
      const chargedAmount = to6dp(costUsd * (1 + PAID_TIER_MARKUP));
      const balance = Number(userData.balance) || 0;
      if (balance < chargedAmount) {
        throw new Error('Insufficient balance. Please add funds on your profile page to continue playing.');
      }
      userUpdate.balance = to6dp(balance - chargedAmount);
      recordedAmount = chargedAmount;
    }
    userUpdate.spendings = applySpending(userData.spendings, formatPeriod(timestamp), recordedAmount, billedTier);

    // ---- writes ----
    if (userSnap.exists) {
      transaction.update(userRef, userUpdate);
    } else {
      transaction.set(userRef, userUpdate, { merge: true });
    }
    transaction.update(gameRef, gameUpdate);
    transaction.set(
      statRef,
      buildRequestStatDoc(
        game.id, game.createdBy, billedTier, modelId, context,
        usage, costUsd, report.durationMs, timestamp,
      ),
    );
    committedUpdate = gameUpdate;
  });

  // Sync the caller's in-memory game with what actually committed, so a later
  // whole-doc save writes the same numbers instead of older ones. Narrow, in-place
  // field updates only: replacing game.bots wholesale would detach the bot objects
  // callers still hold references to (and mutate after this returns).
  if (committedUpdate) syncInMemory(game, committedUpdate);
}

/** Record one bot model call: accumulate on the bot and the game, bill the owner. */
export async function recordBotUsage(
  game: Game,
  botName: string,
  modelId: string,
  report: UsageReport,
): Promise<void> {
  const usage = report.usage;
  if (!usage) return;
  const costUsd = to6dp(computeCostUsd(modelId, usage));
  await commitUsageAtomically(
    game,
    modelId,
    { actor: 'bot', botName },
    report,
    (fresh) => {
      let botFound = false;
      const bots: Bot[] = fresh.bots.map((bot) => {
        if (bot.name !== botName) return bot;
        botFound = true;
        return { ...bot, tokenUsage: addTotals(bot.tokenUsage, usage, costUsd) };
      });
      if (!botFound) return null; // bot not in the game — abort without charging
      return { bots, totalGameCost: to6dp((fresh.totalGameCost ?? 0) + costUsd) };
    },
    (inMemory, committed) => {
      const bot = inMemory.bots.find((b) => b.name === botName);
      const committedBot = (committed.bots as Bot[]).find((b) => b.name === botName);
      if (bot && committedBot) bot.tokenUsage = committedBot.tokenUsage;
      inMemory.totalGameCost = committed.totalGameCost as number;
    },
  );
}

/** Record a GM-model call (dealer narration or the Pit Boss router). */
export async function recordGmUsage(game: Game, modelId: string, report: UsageReport): Promise<void> {
  const usage = report.usage;
  if (!usage) return;
  const costUsd = to6dp(computeCostUsd(modelId, usage));
  await commitUsageAtomically(
    game,
    modelId,
    { actor: 'gm' },
    report,
    (fresh) => ({
      gameMasterTokenUsage: addTotals(fresh.gameMasterTokenUsage, usage, costUsd),
      totalGameCost: to6dp((fresh.totalGameCost ?? 0) + costUsd),
    }),
    (inMemory, committed) => {
      inMemory.gameMasterTokenUsage = committed.gameMasterTokenUsage as TokenUsageTotals;
      inMemory.totalGameCost = committed.totalGameCost as number;
    },
  );
}
