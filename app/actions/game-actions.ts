'use server';

import { auth } from '@/auth';
import { GAME_CONFIG } from '@/config/game';
import { createAgent } from '@/lib/ai/agent-factory';
import {
  buildStoryGenSystemPrompt,
  buildStoryGenUserPrompt,
  StoryGenSchema,
} from '@/lib/ai/prompts/story-gen';
import { addMessageToGame } from '@/lib/actions/messages';
import { shuffle } from '@/lib/engine/deck';
import { COLLECTIONS, db, stripUndefined } from '@/lib/firebase/server';
import { sanitizeGame } from '@/lib/game/sanitize';
import type { Bot, Game, GameMessage, Seat } from '@/models/game';
import { GAME_STATES, RECIPIENT_ALL } from '@/models/game';
import type { GamePreview, GamePreviewInput } from '@/models/preview';
import { getTierAndKeys } from '@/lib/api-keys';
import { dealModels, validateModelUsageForTier } from '@/lib/model-access';
import { FREE_TIER_LIMITS } from '@/config/tiers';
import { PAID_TIER_MARKUP, computeCostUsd } from '@/config/pricing';
import { deductBalance, getUserBalance, updateUserMonthlySpending } from '@/lib/user-balance';
import { USER_TIERS, type UserTier } from '@/models/user';

async function requireEmail(): Promise<string> {
  const session = await auth();
  if (!session?.user?.email) throw new Error('Not authenticated');
  return session.user.email;
}

/**
 * Tier gates before any tokens are spent (werewolf's game-creation gates):
 * - paid: a positive balance — every model call after this bills against it.
 * - free: at most FREE_TIER_LIMITS.GAMES_PER_CALENDAR_DAY games since 00:00 UTC.
 */
async function assertTierAllowsNewGame(email: string, tier: UserTier): Promise<void> {
  if (tier === USER_TIERS.PAID) {
    const balance = await getUserBalance(email);
    if (balance <= 0) {
      throw new Error(
        'Insufficient balance. Please add funds on your profile page before starting a game.',
      );
    }
    return;
  }
  const startOfTodayUTC = new Date();
  startOfTodayUTC.setUTCHours(0, 0, 0, 0);
  const snapshot = await db.collection(COLLECTIONS.games).where('createdBy', '==', email).get();
  const today = snapshot.docs.filter(
    (d) => (d.data().createdAt ?? 0) >= startOfTodayUTC.getTime(),
  ).length;
  if (today >= FREE_TIER_LIMITS.GAMES_PER_CALENDAR_DAY) {
    throw new Error(
      `Free tier limit reached: you can create up to ${FREE_TIER_LIMITS.GAMES_PER_CALENDAR_DAY} games per day. Please try again tomorrow or add funds on your profile page.`,
    );
  }
}

/**
 * Bill the story-generation call. There is no game doc yet, so this is the one AI call
 * charged outside the game transaction (werewolf does the same for previews): paid pays
 * cost + markup from balance, free records the platform's cost in the spending history.
 */
async function chargePreviewUsage(
  email: string,
  tier: UserTier,
  modelId: string,
  usage: { inputTokens: number; outputTokens: number; cachedInputTokens?: number } | undefined,
): Promise<void> {
  if (!usage) return;
  const costUsd = computeCostUsd(modelId, usage);
  if (!(costUsd > 0)) return;
  if (tier === USER_TIERS.PAID) {
    const chargedAmount = parseFloat((costUsd * (1 + PAID_TIER_MARKUP)).toFixed(6));
    const success = await deductBalance(email, chargedAmount);
    if (!success) {
      throw new Error(
        'Insufficient balance. Please add funds on your profile page before starting a game.',
      );
    }
    // Record the billed amount (cost + markup), not the raw model cost, so paid
    // spending history matches what was actually charged.
    await updateUserMonthlySpending(email, chargedAmount, tier);
  } else {
    await updateUserMonthlySpending(email, costUsd, tier);
  }
}

export async function previewGame(input: GamePreviewInput): Promise<GamePreview> {
  const email = await requireEmail();
  validateInput(input);
  const { tier, apiKeys } = await getTierAndKeys(email);
  const botCount = input.playerCount - 1;

  await assertTierAllowsNewGame(email, tier);
  // Deal first so tier violations surface before we spend tokens on story generation.
  const dealt = dealModels(input.botModelIds, botCount, tier, input.gmModelId);
  validateModelUsageForTier(tier, input.gmModelId, dealt);

  const gm = createAgent('GM', buildStoryGenSystemPrompt(), input.gmModelId, apiKeys);
  const reply = await gm.askWithSchema(StoryGenSchema, [
    { role: 'user', content: buildStoryGenUserPrompt(input.theme, input.humanPlayerName, botCount) },
  ]);
  await chargePreviewUsage(email, tier, input.gmModelId, reply.usage);

  // Models sometimes deal the human's own character into `players` despite the prompt, or
  // repeat a name. Either would seat two players under one name, so drop them here — and if
  // that leaves the table short, say so instead of quietly opening a smaller game.
  const seen = new Set<string>([input.humanPlayerName.trim().toLowerCase()]);
  const rivals = reply.content.players.filter((p) => {
    const key = p.name.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (rivals.length < botCount) {
    throw new Error(
      `The story generator dealt only ${rivals.length} of ${botCount} rival characters (it named you as one, or repeated a name). Deal again.`,
    );
  }

  const characters = rivals.slice(0, botCount).map((p, i) => ({
    ...p,
    modelId: dealt[i % dealt.length],
  }));
  return { scene: reply.content.scene, characters };
}

export async function createGame(input: GamePreviewInput, preview: GamePreview): Promise<string> {
  const email = await requireEmail();
  validateInput(input);
  const { tier } = await getTierAndKeys(email);
  await assertTierAllowsNewGame(email, tier);
  validateModelUsageForTier(
    tier,
    input.gmModelId,
    preview.characters.map((c) => c.modelId),
  );

  const now = Date.now();
  const id = `${input.theme.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}-${now}`;

  const seats: Seat[] = [
    { seatIndex: 0, name: input.humanPlayerName, isHuman: true, stack: GAME_CONFIG.startingStack, status: 'active' },
    ...preview.characters.map((c, i) => ({
      seatIndex: i + 1,
      name: c.name,
      isHuman: false,
      stack: GAME_CONFIG.startingStack,
      status: 'active' as const,
    })),
  ];

  const bots: Bot[] = preview.characters.map((c) => ({
    name: c.name,
    gender: c.gender,
    story: c.story,
    personaId: c.personaId,
    aiType: c.modelId,
    summaries: [],
    chatWatermark: 0,
  }));

  const game: Game = {
    id,
    theme: input.theme,
    scene: preview.scene,
    status: GAME_STATES.WELCOME,
    createdBy: email,
    createdWithTier: tier,
    humanPlayerName: input.humanPlayerName,
    seats,
    bots,
    buttonSeat: Math.floor(Math.random() * seats.length),
    blindLevel: 0,
    handNumber: 0,
    hand: null,
    gameQueue: [],
    // intros live on the chat queue — they must never block the deal. Shuffled so the
    // table doesn't introduce itself in seating order every game.
    chatQueue: shuffle(bots).map((b) => ({ actor: b.name, kind: 'WELCOME_INTRO' as const })),
    messageCounter: 0,
    handHistory: [],
    gameMasterAiType: input.gmModelId,
    gameError: null,
    chatError: null,
    gameRetry: null,
    chatRetry: null,
    createdAt: now,
    expireAt: now + GAME_CONFIG.gameTtlDays * 24 * 60 * 60 * 1000,
  };

  await db.collection(COLLECTIONS.games).doc(id).set(stripUndefined(game));
  await addMessageToGame(id, {
    recipientName: RECIPIENT_ALL,
    authorName: 'GM',
    msg: preview.scene,
    messageType: 'GAME_STORY',
    handNumber: 0,
  });
  return id;
}

/** Delete a table for good — the game doc and its whole message log. Owner only. */
export async function deleteGame(gameId: string): Promise<void> {
  const email = await requireEmail();
  const ref = db.collection(COLLECTIONS.games).doc(gameId);
  const snapshot = await ref.get();
  if (!snapshot.exists) return; // already gone — deleting twice is fine
  if (snapshot.data()?.createdBy !== email) throw new Error('Not your table');
  await db.recursiveDelete(ref);
}

export async function listGames(): Promise<Game[]> {
  const email = await requireEmail();
  const snapshot = await db
    .collection(COLLECTIONS.games)
    .where('createdBy', '==', email)
    .get();
  return snapshot.docs
    .map((d) => d.data() as Game)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function getGame(gameId: string): Promise<Game> {
  const email = await requireEmail();
  const snapshot = await db.collection(COLLECTIONS.games).doc(gameId).get();
  if (!snapshot.exists) throw new Error(`Game ${gameId} not found`);
  const game = snapshot.data() as Game;
  if (game.createdBy !== email) throw new Error('Not your game');
  return sanitizeGame(game);
}

export async function getGameMessages(gameId: string): Promise<GameMessage[]> {
  await getGame(gameId); // ownership check
  const snapshot = await db
    .collection(COLLECTIONS.games)
    .doc(gameId)
    .collection('messages')
    .orderBy('__name__')
    .get();
  return snapshot.docs.map((d) => d.data() as GameMessage);
}

function validateInput(input: GamePreviewInput): void {
  if (!input.theme.trim()) throw new Error('Theme is required');
  if (!input.humanPlayerName.trim()) throw new Error('Player name is required');
  if (input.playerCount < GAME_CONFIG.minPlayers || input.playerCount > GAME_CONFIG.maxPlayers)
    throw new Error(`Player count must be ${GAME_CONFIG.minPlayers}-${GAME_CONFIG.maxPlayers}`);
  if (input.botModelIds.length === 0) throw new Error('Select at least one bot model');
}
