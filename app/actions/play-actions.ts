'use server';

import { GAME_CONFIG } from '@/config/game';
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
import { pickResponders } from '@/lib/game/chat-router';
import { blindLevelForHand, nextActiveButton } from '@/lib/game/flow';
import { nextState } from '@/config/state-graph';
import { applyAction, settleHand, startHand } from '@/lib/engine/betting';
import type { ActionType, BettingAction } from '@/lib/engine/types';
import { COLLECTIONS, db, stripUndefined } from '@/lib/firebase/server';
import { sanitizeGame } from '@/lib/game/sanitize';
import type { Game, GameMessage, HandRecord } from '@/models/game';
import { GAME_STATES, RECIPIENT_ALL } from '@/models/game';
import { getApiKeysForUser } from '@/lib/api-keys';

export interface PlayResult {
  game: Game;
  messages: GameMessage[];
  /** false = nothing to do server-side (waiting on the human or game over). */
  progressed: boolean;
}

/**
 * The game pump target: performs ONE step (an intro, one bot decision, a settlement,
 * or a hand start) per call so the client can render between steps.
 */
export const advanceGame = gameAction('advanceGame', {}, async (ctx): Promise<PlayResult> => {
  const game = ctx.game;
  let progressed = true;

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

  await saveGame(game);
  return { game: sanitizeGame(game), messages: await fetchMessages(game.id), progressed };
});

export interface ChatResult {
  messages: GameMessage[];
  /** Chat events still queued after this step. */
  remaining: number;
  progressed: boolean;
}

/**
 * The chat pump target: processes ONE chat-queue event per call. Fully independent of
 * the game pump — it only ever writes `chatQueue` (and messages), so neither pump can
 * block or clobber the other.
 */
export const advanceChat = gameAction('advanceChat', {}, async (ctx): Promise<ChatResult> => {
  const game = ctx.game;
  const event = game.chatQueue[0];
  if (!event) {
    return { messages: await fetchMessages(game.id), remaining: 0, progressed: false };
  }

  const bot = game.bots.find((b) => b.name === event.actor);
  if (bot) {
    const apiKeys = await getApiKeysForUser(game.createdBy);
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
      const reply = await botChatReply(game, bot, chatVisible(messages), apiKeys);
      await addMessageToGame(game.id, {
        recipientName: RECIPIENT_ALL,
        authorName: bot.name,
        msg: reply,
        messageType: 'BOT_ANSWER',
        handNumber: game.handNumber,
      });
    }
  }

  const rest = game.chatQueue.slice(1);
  await db.collection(COLLECTIONS.games).doc(game.id).update({ chatQueue: rest });
  return { messages: await fetchMessages(game.id), remaining: rest.length, progressed: true };
});

/**
 * Human table talk: store the message, pick responders (name-mentioned bots, else 1-2
 * random live ones), queue their replies on the chat queue. The game never waits for chat.
 * TODO: replace random pick with the LLM GM router (werewolf's bot-selection port).
 */
export const sendChatMessage = gameAction(
  'sendChatMessage',
  {},
  async (ctx: ActionContext, text: string): Promise<ChatResult> => {
    const game = ctx.game;
    const trimmed = text.trim();
    if (!trimmed) throw new Error('Empty message');

    await addMessageToGame(game.id, {
      recipientName: RECIPIENT_ALL,
      authorName: game.humanPlayerName,
      msg: trimmed,
      messageType: 'HUMAN_PLAYER_MESSAGE',
      handNumber: game.handNumber,
    });

    const { responders, trigger } = pickResponders(game, trimmed);

    const chatQueue = [
      ...game.chatQueue,
      ...responders.map((b) => ({ actor: b.name, kind: 'CHAT_REPLY' as const, trigger })),
    ];
    await db.collection(COLLECTIONS.games).doc(game.id).update({ chatQueue });
    return { messages: await fetchMessages(game.id), remaining: chatQueue.length, progressed: true };
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
    return { game: sanitizeGame(game), messages: await fetchMessages(game.id), progressed: true };
  },
);

// ---- internals ----

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
 */
async function saveGame(game: Game): Promise<void> {
  const { chatQueue: _chatQueue, messageCounter: _messageCounter, ...owned } = game;
  await db
    .collection(COLLECTIONS.games)
    .doc(game.id)
    .update(stripUndefined(owned) as { [k: string]: unknown });
}
