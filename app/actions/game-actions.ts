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
import { COLLECTIONS, db, stripUndefined } from '@/lib/firebase/server';
import { sanitizeGame } from '@/lib/game/sanitize';
import type { Bot, Game, GameMessage, Seat } from '@/models/game';
import { GAME_STATES, RECIPIENT_ALL } from '@/models/game';
import type { GamePreview, GamePreviewInput } from '@/models/preview';
import { getTierAndKeys } from '@/lib/api-keys';
import {
  dealModels,
  getProvidedApiKeyNames,
  validateModelUsageForTier,
} from '@/lib/model-access';

async function requireEmail(): Promise<string> {
  const session = await auth();
  if (!session?.user?.email) throw new Error('Not authenticated');
  return session.user.email;
}

export async function previewGame(input: GamePreviewInput): Promise<GamePreview> {
  const email = await requireEmail();
  validateInput(input);
  const { tier, apiKeys } = await getTierAndKeys(email);
  const botCount = input.playerCount - 1;

  // Deal first so tier violations surface before we spend tokens on story generation.
  const dealt = dealModels(input.botModelIds, botCount, tier, input.gmModelId);
  validateModelUsageForTier(tier, input.gmModelId, dealt, getProvidedApiKeyNames(apiKeys));

  const gm = createAgent('GM', buildStoryGenSystemPrompt(), input.gmModelId, apiKeys);
  const reply = await gm.askWithSchema(StoryGenSchema, [
    { role: 'user', content: buildStoryGenUserPrompt(input.theme, input.humanPlayerName, botCount) },
  ]);

  const characters = reply.content.players.slice(0, botCount).map((p, i) => ({
    ...p,
    modelId: dealt[i % dealt.length],
  }));
  return { scene: reply.content.scene, characters };
}

export async function createGame(input: GamePreviewInput, preview: GamePreview): Promise<string> {
  const email = await requireEmail();
  validateInput(input);
  const { tier, apiKeys } = await getTierAndKeys(email);
  validateModelUsageForTier(
    tier,
    input.gmModelId,
    preview.characters.map((c) => c.modelId),
    getProvidedApiKeyNames(apiKeys),
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
    // intros live on the chat queue — they must never block the deal
    chatQueue: bots.map((b) => ({ actor: b.name, kind: 'WELCOME_INTRO' as const })),
    messageCounter: 0,
    handHistory: [],
    gameMasterAiType: input.gmModelId,
    errorState: null,
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
