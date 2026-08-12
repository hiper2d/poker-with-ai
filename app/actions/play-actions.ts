'use server';

import { GAME_CONFIG } from '@/config/game';
import type { ApiKeyMap } from '@/config/models';
import { gameAction, type ActionContext } from '@/lib/actions/game-action';
import { addMessageToGame, fetchMessages } from '@/lib/actions/messages';
import {
  botChatReply,
  botIntro,
  compactBotChat,
  compactBotContext,
  decideBotAction,
} from '@/lib/ai/bot-player';
import { buildCompactionEvents, estimateTokens } from '@/lib/game/compaction';
import { chatBudget, liveBots, shouldRouteReaction } from '@/lib/game/chat-router';
import { routeChat } from '@/lib/ai/pit-boss';
import { isAiCallError, isResponseFormatFailure, type AiCallError } from '@/lib/ai/errors';
import { blindLevelForHand, nextActiveButton } from '@/lib/game/flow';
import { nextState } from '@/config/state-graph';
import { applyAction, settleHand, startHand } from '@/lib/engine/betting';
import type { ActionType, BettingAction } from '@/lib/engine/types';
import { COLLECTIONS, db, stripUndefined } from '@/lib/firebase/server';
import { sanitizeGame } from '@/lib/game/sanitize';
import type {
  ChatEvent,
  Game,
  GameErrorState,
  GameMessage,
  HandRecord,
  Lane,
  RetryPlan,
  RoutingCause,
} from '@/models/game';
import { GAME_STATES, PIT_BOSS, RECIPIENT_ALL } from '@/models/game';
import { ERROR_FIELD, laneBlocked, laneError, RETRY_FIELD } from '@/lib/game/retry';
import { getApiKeysForUser, getTierAndKeys } from '@/lib/api-keys';
import { getProvidedApiKeyNames, validateModelUsageForTier } from '@/lib/model-access';

export interface PlayResult {
  game: Game;
  messages: GameMessage[];
  /** false = nothing to do server-side (waiting on the human or game over). */
  progressed: boolean;
  /** Set only when this step queued chat replies, so the client can wake the chat pump. */
  chatQueued?: number;
  /** The game lane's error: non-null means the lane is stopped until the player retries. */
  gameError: GameErrorState | null;
}

/**
 * The game pump target: performs ONE step (an intro, one bot decision, a settlement,
 * or a hand start) per call so the client can render between steps.
 */
export const advanceGame = gameAction(
  'advanceGame',
  { lane: 'game' },
  async (ctx: ActionContext): Promise<PlayResult> => {
  const game = ctx.game;
  let progressed = true;
  let chatQueued: number | undefined;

  // A stopped lane stays stopped until the player clears the error: the pump calling again
  // (a stray tick, a second tab, a remount) must not re-fire a failed model call.
  if (laneBlocked(game, 'game')) {
    return {
      game: sanitizeGame(game),
      messages: await fetchMessages(game.id),
      progressed: false,
      gameError: laneError(game, 'game'),
    };
  }
  await consumeRetryPlan(game, 'game');

  try {
    switch (game.status) {
      case GAME_STATES.WELCOME: {
        // intros run on the independent chat queue — deal immediately
        await startNextHand(game);
        break;
      }

      case GAME_STATES.BETTING: {
        const hand = game.hand;
        if (!hand) {
          await startNextHand(game);
          break;
        }
        if (hand.complete) {
          await settleAndRecord(game);
          break;
        }
        const bot = game.bots.find((b) => b.name === hand.toAct);
        if (!bot) {
          progressed = false; // human's turn — the UI takes over
          break;
        }
        const apiKeys = await getApiKeysForUser(game.createdBy);
        const messages = await fetchMessages(game.id);
        const turn = await decideBotAction(game, bot, chatVisible(messages), apiKeys);
        applyAction(hand, turn.action);
        await addMessageToGame(game.id, {
          recipientName: RECIPIENT_ALL,
          authorName: bot.name,
          msg: actionText(bot.name, turn.action),
          messageType: 'GAME_ACTION',
          handNumber: game.handNumber,
        });
        if (turn.tableTalk) {
          await addMessageToGame(game.id, {
            recipientName: RECIPIENT_ALL,
            authorName: bot.name,
            msg: turn.tableTalk,
            messageType: 'TABLE_TALK',
            handNumber: game.handNumber,
          });
          // The bet is decided and announced; persist it before the optional routing below
          // so a Pit Boss failure can't roll back an action the table already saw.
          await saveGame(game);
          // A bot needling the table is a chat trigger of its own: ask the Pit Boss whether
          // anyone answers. Usually nobody does — see shouldRouteReaction for the gates.
          const budget = chatBudget(game, messages);
          if (shouldRouteReaction(game, budget)) {
            const talk: GameMessage = {
              recipientName: RECIPIENT_ALL,
              authorName: bot.name,
              msg: turn.tableTalk,
              messageType: 'TABLE_TALK',
              handNumber: game.handNumber,
              timestamp: Date.now(),
            };
            const before = game.chatQueue.length;
            const cause: RoutingCause = {
              kind: 'reaction',
              author: bot.name,
              text: turn.tableTalk,
            };
            game.chatQueue = await routeAndQueue(
              game,
              [...chatVisible(messages), talk],
              apiKeys,
              cause,
              { min: 0, max: Math.min(GAME_CONFIG.chatRouterMaxReactors, budget.remaining) },
              'reaction',
            );
            // Only signal the client when someone actually picked up the thread.
            if (game.chatQueue.length > before) chatQueued = game.chatQueue.length;
          }
        }
        break;
      }

      case GAME_STATES.HAND_RESULTS: {
        const messages = await fetchMessages(game.id);
        const next = nextState(game, messages);
        if (next === GAME_STATES.GAME_OVER) {
          game.status = GAME_STATES.GAME_OVER;
          const champion = game.seats.find((s) => s.status === 'active');
          await addMessageToGame(game.id, {
            recipientName: RECIPIENT_ALL,
            authorName: 'GM',
            msg: `${champion?.name ?? 'Nobody'} takes it all. The table goes quiet.`,
            messageType: 'GAME_STORY',
            handNumber: game.handNumber,
          });
        } else if (next === GAME_STATES.COMPACTION) {
          // Between hands is when bots tidy their memory.
          game.gameQueue = buildCompactionEvents(game, messages);
          game.status = GAME_STATES.COMPACTION;
        } else {
          await startNextHand(game);
        }
        break;
      }

      case GAME_STATES.COMPACTION: {
        const event = game.gameQueue[0];
        if (!event) {
          await startNextHand(game);
          break;
        }
        const rest = game.gameQueue.slice(1);
        const bot = game.bots.find((b) => b.name === event.actor);
        if (bot) {
          const apiKeys = await getApiKeysForUser(game.createdBy);
          if (event.kind === 'COMPACT_CHAT') {
            const messages = await fetchMessages(game.id);
            const result = await compactBotChat(game, bot, messages, apiKeys);
            bot.summaries = [...bot.summaries, result.entry];
            bot.chatWatermark = result.watermark;
            // If the notes themselves outgrew the budget, collapse them next.
            if (estimateTokens(bot.summaries.join('\n')) > GAME_CONFIG.contextCompactionTokenThreshold) {
              rest.push({ actor: bot.name, kind: 'COMPACT_CONTEXT' });
            }
            await addMessageToGame(game.id, {
              recipientName: RECIPIENT_ALL,
              authorName: 'GM',
              msg: `${bot.name} files away what the table has shown.`,
              messageType: 'COMPACTION',
              handNumber: game.handNumber,
            });
          } else if (event.kind === 'COMPACT_CONTEXT') {
            bot.summaries = [await compactBotContext(game, bot, apiKeys)];
            await addMessageToGame(game.id, {
              recipientName: RECIPIENT_ALL,
              authorName: 'GM',
              msg: `${bot.name} distills their reads down to the essentials.`,
              messageType: 'COMPACTION',
              handNumber: game.handNumber,
            });
          }
        }
        game.gameQueue = rest;
        if (nextState(game) === GAME_STATES.BETTING) await startNextHand(game);
        break;
      }

      default:
        progressed = false;
    }

  } catch (error) {
    // A failed model call is the player's decision to make, not ours to paper over: record
    // it, stop the pump, and let them retry (optionally on another model). The game is NOT
    // saved here — nothing the failed step touched gets persisted half-done.
    if (!isAiCallError(error)) throw error;
    const gameError = await ctx.recordFailure('game', aiFailure(error, 'advanceGame', true));
    return {
      game: sanitizeGame(game),
      messages: await fetchMessages(game.id),
      progressed: false,
      gameError,
    };
  }

  await saveGame(game);
  return {
    game: sanitizeGame(game),
    messages: await fetchMessages(game.id),
    progressed,
    chatQueued,
    gameError: null,
  };
  },
);

export interface ChatResult {
  messages: GameMessage[];
  /** Chat events still queued after this step. */
  remaining: number;
  progressed: boolean;
  /** The chat lane's error: non-null means the lane is stopped until the player retries. */
  chatError: GameErrorState | null;
}

/**
 * The chat pump target: processes ONE chat-queue event per call. Fully independent of
 * the game pump — it only ever writes `chatQueue` (and messages), so neither pump can
 * block or clobber the other.
 */
export const advanceChat = gameAction(
  'advanceChat',
  { lane: 'chat' },
  async (ctx: ActionContext): Promise<ChatResult> => {
  const game = ctx.game;
  if (laneBlocked(game, 'chat')) {
    return {
      messages: await fetchMessages(game.id),
      remaining: game.chatQueue.length,
      progressed: false,
      chatError: laneError(game, 'chat'),
    };
  }
  const event = game.chatQueue[0];
  if (!event) {
    return {
      messages: await fetchMessages(game.id),
      remaining: 0,
      progressed: false,
      chatError: null,
    };
  }
  await consumeRetryPlan(game, 'chat');

  const bot = game.bots.find((b) => b.name === event.actor);
  if (bot) {
    const apiKeys = await getApiKeysForUser(game.createdBy);
    try {
      if (event.kind === 'WELCOME_INTRO') {
        const intro = await botIntro(game, bot, apiKeys);
        await addMessageToGame(game.id, {
          recipientName: RECIPIENT_ALL,
          authorName: bot.name,
          msg: intro,
          messageType: 'BOT_INTRO',
          handNumber: 0,
        });
      } else {
        const messages = await fetchMessages(game.id);
        const reply = await botChatReply(game, bot, chatVisible(messages), apiKeys, event.cause);
        await addMessageToGame(game.id, {
          recipientName: RECIPIENT_ALL,
          authorName: bot.name,
          msg: reply,
          messageType: 'BOT_ANSWER',
          handNumber: game.handNumber,
        });
      }
    } catch (error) {
      if (!isAiCallError(error)) throw error;
      // The event stays at the head of the queue, so a retry replays this same speaker.
      const chatError = await ctx.recordFailure('chat', aiFailure(error, 'advanceChat', true));
      return {
        messages: await fetchMessages(game.id),
        remaining: game.chatQueue.length,
        progressed: false,
        chatError,
      };
    }
  }

  const remaining = await dequeueChat(game.id);
  return { messages: await fetchMessages(game.id), remaining, progressed: true, chatError: null };
  },
);

/**
 * Human table talk: store the message, ask the Pit Boss who answers, queue their replies.
 * The game never waits for chat.
 *
 * The message is persisted BEFORE routing, so a failed routing call never costs the
 * player what they typed (werewolf learned this one the hard way).
 */
export const sendChatMessage = gameAction(
  'sendChatMessage',
  {},
  async (ctx: ActionContext, text: string): Promise<ChatResult> => {
    const game = ctx.game;
    const trimmed = text.trim();
    if (!trimmed) throw new Error('Empty message');
    if (retryPending(game)) {
      // A queued speaker still needs retrying; a new message would jump the line.
      return {
        messages: await fetchMessages(game.id),
        remaining: game.chatQueue.length,
        progressed: false,
        chatError: laneError(game, 'chat'),
      };
    }
    // Saying something else is how the player recovers from a failed routing call, so this
    // clears a non-retryable error rather than refusing to run.
    await clearLaneError(game, 'chat');
    await consumeRetryPlan(game, 'chat');

    await addMessageToGame(game.id, {
      recipientName: RECIPIENT_ALL,
      authorName: game.humanPlayerName,
      msg: trimmed,
      messageType: 'HUMAN_PLAYER_MESSAGE',
      handNumber: game.handNumber,
    });

    const messages = await fetchMessages(game.id);
    const budget = chatBudget(game, messages);
    if (budget.remaining === 0) {
      // Out of chat budget: the message still lands (bots read it as context on their
      // next turn), the table just doesn't answer. The UI explains the silence.
      ctx.logger.info('chat budget exhausted — no responders queued', { budget });
      return { messages, remaining: game.chatQueue.length, progressed: false, chatError: null };
    }

    const apiKeys = await getApiKeysForUser(game.createdBy);
    const cause: RoutingCause = { kind: 'human', author: game.humanPlayerName, text: trimmed };
    try {
      const queue = await routeAndQueue(game, chatVisible(messages), apiKeys, cause, {
        min: Math.min(GAME_CONFIG.chatRouterMinBots, budget.remaining),
        max: Math.min(GAME_CONFIG.chatRouterMaxBots, budget.remaining),
      }, 'router');
      return {
        messages: await fetchMessages(game.id),
        remaining: queue.length,
        progressed: true,
        chatError: null,
      };
    } catch (error) {
      // The player's message is already saved — only the routing failed, so Retry replays
      // the routing alone rather than posting the message a second time.
      if (!isAiCallError(error)) throw error;
      return {
        messages: await fetchMessages(game.id),
        remaining: game.chatQueue.length,
        progressed: false,
        chatError: await ctx.recordFailure('chat', aiFailure(error, 'sendChatMessage', game.chatQueue.length > 0)),
      };
    }
  },
);

/**
 * Nudge the table: the Pit Boss picks speakers with no new human message, for when the
 * player wants to watch the characters talk to each other.
 */
export const continueChat = gameAction(
  'continueChat',
  {},
  async (ctx: ActionContext): Promise<ChatResult> => {
    const game = ctx.game;
    if (retryPending(game)) {
      return {
        messages: await fetchMessages(game.id),
        remaining: game.chatQueue.length,
        progressed: false,
        chatError: laneError(game, 'chat'),
      };
    }
    // Nudging the table is the other way out of a failed routing call.
    await clearLaneError(game, 'chat');
    await consumeRetryPlan(game, 'chat');
    const messages = await fetchMessages(game.id);
    const budget = chatBudget(game, messages);
    if (budget.remaining === 0 || game.chatQueue.length > 0) {
      return { messages, remaining: game.chatQueue.length, progressed: false, chatError: null };
    }

    const apiKeys = await getApiKeysForUser(game.createdBy);
    const cause: RoutingCause = { kind: 'nudge' };
    try {
      const queue = await routeAndQueue(game, chatVisible(messages), apiKeys, cause, {
        min: Math.min(GAME_CONFIG.chatRouterMinBots, budget.remaining),
        max: Math.min(GAME_CONFIG.chatRouterMaxBots, budget.remaining),
      }, 'router');
      return {
        messages: await fetchMessages(game.id),
        remaining: queue.length,
        progressed: true,
        chatError: null,
      };
    } catch (error) {
      if (!isAiCallError(error)) throw error;
      return {
        messages: await fetchMessages(game.id),
        remaining: game.chatQueue.length,
        progressed: false,
        chatError: await ctx.recordFailure('chat', aiFailure(error, 'continueChat', game.chatQueue.length > 0)),
      };
    }
  },
);

/**
 * Hand the mic to specific characters — no routing call, no Pit Boss. Still budgeted:
 * a manual pick costs the same model calls as a routed one.
 */
export const selectChatSpeakers = gameAction(
  'selectChatSpeakers',
  {},
  async (ctx: ActionContext, names: string[]): Promise<ChatResult> => {
    const game = ctx.game;
    const messages = await fetchMessages(game.id);
    const budget = chatBudget(game, messages);

    const live = new Set(liveBots(game).map((b) => b.name));
    const valid = names.filter((n, i) => live.has(n) && n !== game.humanPlayerName && names.indexOf(n) === i);
    if (!valid.length) throw new Error('No valid speakers selected');

    const speakers = valid.slice(0, Math.min(GAME_CONFIG.chatRouterMaxBots, budget.remaining));
    if (!speakers.length || retryPending(game)) {
      return {
        messages,
        remaining: game.chatQueue.length,
        progressed: false,
        chatError: laneError(game, 'chat'),
      };
    }

    // Handing the mic to someone by name needs no Pit Boss, so it also clears a failed
    // routing call — it is the surest way out of one.
    await clearLaneError(game, 'chat');
    const queue = await enqueueChat(
      game.id,
      speakers.map((actor) => ({ actor, kind: 'CHAT_REPLY' as const, trigger: 'manual' as const })),
    );
    return { messages, remaining: queue.length, progressed: true, chatError: null };
  },
);

/** Apply the human player's betting decision, then hand control back to the pump. */
export const humanAction = gameAction(
  'humanAction',
  { expectState: [GAME_STATES.BETTING] },
  async (ctx: ActionContext, type: ActionType, amount?: number): Promise<PlayResult> => {
    const game = ctx.game;
    const hand = game.hand;
    if (!hand || hand.complete) throw new Error('No live betting round');
    if (hand.toAct !== game.humanPlayerName) throw new Error('Not your turn');

    const action: BettingAction = { player: game.humanPlayerName, type, amount };
    applyAction(hand, action);
    await addMessageToGame(game.id, {
      recipientName: RECIPIENT_ALL,
      authorName: game.humanPlayerName,
      msg: actionText(game.humanPlayerName, action),
      messageType: 'GAME_ACTION',
      handNumber: game.handNumber,
    });
    await saveGame(game);
    return {
      game: sanitizeGame(game),
      messages: await fetchMessages(game.id),
      progressed: true,
      gameError: laneError(game, 'game'),
    };
  },
);

/**
 * Retry a stopped lane — werewolf's flow exactly: clearing the error IS the retry. The
 * lane's pump wakes up and re-runs whatever step is still pending (the queue head is
 * untouched, so a failed bot speaks again), and what the clear leaves behind is a one-shot
 * RetryPlan carrying the failure hint and, optionally, a different model for that one call.
 */
export const retryLane = gameAction(
  'retryLane',
  {},
  async (ctx: ActionContext, lane: Lane, model?: string): Promise<GameErrorState | null> => {
    const game = ctx.game;
    const error = laneError(game, lane);
    if (!error) return null; // already cleared by another tab — nothing to do

    if (model && error.actor) {
      // A one-shot model must still obey the tier's rules, so substitute it into the
      // seating and validate the whole table exactly as game creation would.
      const { tier, apiKeys } = await getTierAndKeys(ctx.userEmail);
      validateModelUsageForTier(
        tier,
        error.actor === PIT_BOSS ? model : game.gameMasterAiType,
        game.bots.map((b) => (b.name === error.actor ? model : b.aiType)),
        getProvidedApiKeyNames(apiKeys),
      );
    }

    // A hint only when the model made a describable mistake (garbage instead of the requested
    // JSON) and only on a plain Retry: a different model has not made the mistake being
    // described, and a timeout or 5xx has nothing to tell the model. (werewolf's retry-hint rules)
    const hint = !model && isResponseFormatFailure(error.details) ? error.details : undefined;
    const plan: RetryPlan | null =
      error.actor && (hint || model)
        ? { actor: error.actor, ...(hint ? { hint } : {}), ...(model ? { model } : {}) }
        : null;
    await db
      .collection(COLLECTIONS.games)
      .doc(game.id)
      .update({ [ERROR_FIELD[lane]]: null, [RETRY_FIELD[lane]]: plan });
    ctx.logger.info('lane cleared for retry', { lane, actor: error.actor, model });
    return null;
  },
);

// ---- internals ----

/** Turn a failed model call into the state that drives the banner and the retry prompt. */
function aiFailure(
  error: AiCallError,
  failedAction: string,
  retryable: boolean,
): Omit<GameErrorState, 'timestamp'> {
  const who = error.actor === PIT_BOSS ? 'The Pit Boss' : error.actor;
  return {
    message: `${who} couldn't respond — the model call failed.`,
    details: error.details,
    failedAction,
    actor: error.actor,
    model: error.model,
    retryable,
  };
}

/** True while a stopped lane still has a queued step the player is expected to retry. */
function retryPending(game: Game): boolean {
  return laneError(game, 'chat')?.retryable === true;
}

/** Drop a non-retryable error because the player took one of the actions that recovers it. */
async function clearLaneError(game: Game, lane: Lane): Promise<void> {
  if (!laneError(game, lane)) return;
  await db.collection(COLLECTIONS.games).doc(game.id).update({ [ERROR_FIELD[lane]]: null });
}

/**
 * Spend a lane's pending retry plan: clear it in Firestore BEFORE the call runs, but keep
 * it on the in-memory game so this one attempt still gets the hint and the substituted
 * model. If it fails again the next attempt starts clean, rather than looping on a stale
 * hint or staying stuck on a model the player only meant to try once.
 */
async function consumeRetryPlan(game: Game, lane: Lane): Promise<void> {
  if (!game[RETRY_FIELD[lane]]) return;
  await db.collection(COLLECTIONS.games).doc(game.id).update({ [RETRY_FIELD[lane]]: null });
}

/**
 * Ask the Pit Boss who speaks, record the decision, and queue the replies.
 * Returns the resulting chat queue. An empty selection queues nothing and stays silent —
 * for reactions that is the common, correct outcome.
 */
async function routeAndQueue(
  game: Game,
  recentChat: GameMessage[],
  apiKeys: ApiKeyMap,
  cause: RoutingCause,
  bounds: { min: number; max: number },
  trigger: 'router' | 'reaction',
): Promise<ChatEvent[]> {
  if (bounds.max <= 0) return game.chatQueue;

  const { speakers, reasoning } = await routeChat(game, recentChat, apiKeys, cause, bounds);
  if (!speakers.length) return game.chatQueue;

  await addMessageToGame(game.id, {
    recipientName: RECIPIENT_ALL,
    authorName: PIT_BOSS,
    msg: `Pit Boss calls on ${speakers.join(', ')} — ${reasoning || 'no reason given'}`,
    messageType: 'GM_ROUTER_SELECTION',
    handNumber: game.handNumber,
  });

  return enqueueChat(
    game.id,
    speakers.map((actor) => ({
      actor,
      kind: 'CHAT_REPLY' as const,
      trigger,
      ...(cause.author && cause.text ? { cause: { author: cause.author, text: cause.text } } : {}),
    })),
  );
}

/**
 * Append to the chat queue transactionally. The chat pump shifts entries off the front of
 * this same array from another request, so a read-modify-write here would drop replies —
 * and `saveGame` deliberately refuses to touch chatQueue at all.
 */
async function enqueueChat(gameId: string, events: ChatEvent[]): Promise<ChatEvent[]> {
  const ref = db.collection(COLLECTIONS.games).doc(gameId);
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const current = (snapshot.data()?.chatQueue as ChatEvent[]) ?? [];
    const queue = [...current, ...events];
    tx.update(ref, { chatQueue: queue });
    return queue;
  });
}

/**
 * Drop the head event the chat pump just played out. Transactional for the same reason as
 * enqueueChat: a plain write of `queue.slice(1)` computed from a stale read would silently
 * swallow any reply queued while the bot was talking.
 */
async function dequeueChat(gameId: string): Promise<number> {
  const ref = db.collection(COLLECTIONS.games).doc(gameId);
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const queue = ((snapshot.data()?.chatQueue as ChatEvent[]) ?? []).slice(1);
    tx.update(ref, { chatQueue: queue });
    return queue.length;
  });
}

async function startNextHand(game: Game): Promise<void> {
  game.handNumber += 1;
  game.blindLevel = blindLevelForHand(game.handNumber);
  const { smallBlind, bigBlind } = GAME_CONFIG.blindLevels[game.blindLevel];
  game.buttonSeat = nextActiveButton(game.seats, game.buttonSeat);
  game.hand = startHand(game.seats, game.buttonSeat, game.handNumber, smallBlind, bigBlind);
  game.status = GAME_STATES.BETTING;
  await addMessageToGame(game.id, {
    recipientName: RECIPIENT_ALL,
    authorName: 'GM',
    msg: `Hand #${game.handNumber} — blinds ${smallBlind}/${bigBlind}.`,
    messageType: 'GAME_ACTION',
    handNumber: game.handNumber,
  });
}

async function settleAndRecord(game: Game): Promise<void> {
  const hand = game.hand!;
  const result = settleHand(hand);

  for (const seat of game.seats) {
    const delta = result.stackDeltas[seat.name];
    if (delta !== undefined) seat.stack += delta;
    if (seat.status === 'active' && seat.stack <= 0) {
      seat.status = 'eliminated';
      seat.eliminatedInHand = game.handNumber;
    }
  }

  const record: HandRecord = {
    handNumber: game.handNumber,
    winners: result.winners.map((w) => ({
      name: w.name,
      amountWon: w.amountWon,
      shownCards: w.shownCards ? [...w.shownCards] : undefined,
    })),
    potSize: hand.players.reduce((sum, p) => sum + p.totalCommitted, 0),
    board: [...hand.board],
    keyActions: hand.actionLog
      .map((a) => `${a.player} ${a.type}${a.amount ? ` ${a.amount}` : ''} (${a.street})`)
      .join(', '),
    eliminated: game.seats
      .filter((s) => s.eliminatedInHand === game.handNumber)
      .map((s) => s.name),
  };
  game.handHistory = [...game.handHistory, record];
  game.status = GAME_STATES.HAND_RESULTS;

  const lines = result.winners.map(
    (w) =>
      `${w.name} wins ${w.amountWon.toLocaleString()}${w.hand ? ` with ${w.hand}` : ''}${
        w.shownCards ? ` (${w.shownCards.join(' ')})` : ''
      }`,
  );
  const busted = record.eliminated.length
    ? ` ${record.eliminated.join(', ')} ${record.eliminated.length > 1 ? 'are' : 'is'} out.`
    : '';
  await addMessageToGame(game.id, {
    recipientName: RECIPIENT_ALL,
    authorName: 'GM',
    msg: `${lines.join('; ')}.${busted}`,
    messageType: 'HAND_RESULT',
    handNumber: game.handNumber,
  });
}

function actionText(name: string, action: BettingAction): string {
  switch (action.type) {
    case 'fold':
      return `${name} folds.`;
    case 'check':
      return `${name} checks.`;
    case 'call':
      return `${name} calls.`;
    case 'bet':
      return `${name} bets ${action.amount?.toLocaleString()}.`;
    case 'raise':
      return `${name} raises to ${action.amount?.toLocaleString()}.`;
  }
}

function chatVisible(messages: GameMessage[]): GameMessage[] {
  return messages.filter((m) =>
    ['TABLE_TALK', 'HUMAN_PLAYER_MESSAGE', 'BOT_INTRO', 'BOT_ANSWER'].includes(m.messageType),
  );
}

/**
 * Persist game-pump-owned fields ONLY. `messageCounter` belongs to the message
 * transaction and `chatQueue` to the chat pump — writing either here would clobber
 * concurrent updates (that exact bug shipped once: three intros all got id 000002).
 * The per-lane errors and overrides belong to the retry machinery: the in-memory copies are
 * deliberately stale (an override is kept locally after being spent), so writing them back
 * would resurrect a consumed override or a cleared error.
 */
async function saveGame(game: Game): Promise<void> {
  const {
    chatQueue: _chatQueue,
    messageCounter: _messageCounter,
    gameError: _gameError,
    chatError: _chatError,
    gameRetry: _gameRetry,
    chatRetry: _chatRetry,
    ...owned
  } = game;
  await db
    .collection(COLLECTIONS.games)
    .doc(game.id)
    .update(stripUndefined(owned) as { [k: string]: unknown });
}
