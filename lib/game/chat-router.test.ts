import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '@/config/game';
import { gameWith, msg } from './test-fixtures';
import {
  chatActivity,
  chatBudget,
  clampSpeakers,
  formatActivity,
  liveBots,
  shouldRouteReaction,
} from './chat-router';

// Both bots live for router tests (default fixture eliminates Mara).
function chattyGame() {
  const game = gameWith({});
  game.seats = game.seats.map((s) => ({ ...s, status: 'active' as const, stack: 10000 }));
  return game;
}

describe('liveBots', () => {
  it('excludes eliminated bots', () => {
    const game = gameWith({}); // Mara eliminated
    expect(liveBots(game).map((b) => b.name)).toEqual(['Vex']);
  });
});

describe('chatActivity', () => {
  it('counts recent talk per live bot, quietest first', () => {
    const game = chattyGame();
    const messages = [
      msg(1, 'BOT_ANSWER', 'a', 'Vex', 4),
      msg(2, 'TABLE_TALK', 'b', 'Vex', 4),
      msg(3, 'BOT_ANSWER', 'c', 'Mara', 4),
    ];
    expect(chatActivity(game, messages)).toEqual([
      { name: 'Mara', count: 1 },
      { name: 'Vex', count: 2 },
    ]);
  });

  it('ignores hands older than the window and non-talk messages', () => {
    const game = chattyGame(); // hand #4, default window is 3 hands
    const messages = [
      msg(1, 'BOT_ANSWER', 'ancient', 'Vex', 0),
      msg(2, 'GAME_ACTION', 'Vex folds.', 'Vex', 4),
      msg(3, 'HUMAN_PLAYER_MESSAGE', 'hi', 'Paul', 4),
    ];
    expect(chatActivity(game, messages)).toEqual([
      { name: 'Mara', count: 0 },
      { name: 'Vex', count: 0 },
    ]);
  });

  it('flags the quietest bots as owed a turn', () => {
    const line = formatActivity([
      { name: 'Mara', count: 0 },
      { name: 'Vex', count: 1 },
      { name: 'Duchess', count: 9 },
    ]);
    expect(line).toContain('Mara: 0 recent ⚠️ OWED A TURN');
    expect(line).toContain('Vex: 1 recent ⚠️ OWED A TURN');
    expect(line).toContain('Duchess: 9 recent');
    expect(line).not.toContain('Duchess: 9 recent ⚠️');
  });
});

describe('clampSpeakers', () => {
  const candidates = ['Vex', 'Mara'];

  it('drops hallucinated names and duplicates', () => {
    const { speakers, dropped } = clampSpeakers(
      ['Vex', 'Ghost', 'Vex', 'Mara'],
      candidates,
      { min: 0, max: 5 },
    );
    expect(speakers).toEqual(['Vex', 'Mara']);
    expect(dropped).toEqual(['Ghost', 'Vex']);
  });

  it('caps at max, keeping the order the router chose', () => {
    const { speakers } = clampSpeakers(['Mara', 'Vex'], candidates, { min: 0, max: 1 });
    expect(speakers).toEqual(['Mara']);
  });

  it('tops up to min when every name was invalid', () => {
    const { speakers, dropped } = clampSpeakers(['Ghost'], candidates, { min: 1, max: 3 });
    expect(speakers).toHaveLength(1);
    expect(candidates).toContain(speakers[0]);
    expect(dropped).toEqual(['Ghost']);
  });

  it('allows silence when min is 0', () => {
    expect(clampSpeakers([], candidates, { min: 0, max: 2 }).speakers).toEqual([]);
  });

  it('never invents speakers beyond the candidate list', () => {
    const { speakers } = clampSpeakers([], candidates, { min: 5, max: 5 });
    expect(speakers.sort()).toEqual(['Mara', 'Vex']);
  });
});

describe('chatBudget', () => {
  const limits = GAME_CONFIG.chatBudget;

  it('counts bot replies for this hand and the whole game', () => {
    const game = chattyGame(); // hand #4, tier 'paid'
    const messages = [
      msg(1, 'BOT_ANSWER', 'old', 'Vex', 3),
      msg(2, 'BOT_ANSWER', 'now', 'Vex', 4),
      msg(3, 'BOT_ANSWER', 'now', 'Mara', 4),
    ];
    const budget = chatBudget(game, messages);
    expect(budget.handUsed).toBe(2);
    expect(budget.gameUsed).toBe(3);
    expect(budget.remaining).toBe(limits.default.perHand - 2);
  });

  it('ignores table talk and intros — those ride on calls already paid for', () => {
    const game = chattyGame();
    const messages = [
      msg(1, 'TABLE_TALK', 'jab', 'Vex', 4),
      msg(2, 'BOT_INTRO', 'hello', 'Mara', 0),
    ];
    expect(chatBudget(game, messages).gameUsed).toBe(0);
  });

  it('gives free-tier games a tighter allowance', () => {
    const game = chattyGame();
    game.createdWithTier = 'free';
    const messages = Array.from({ length: limits.free.perHand }, (_, i) =>
      msg(i + 1, 'BOT_ANSWER', 'chat', 'Vex', 4),
    );
    const budget = chatBudget(game, messages);
    expect(budget.remaining).toBe(0);
    expect(budget.gameExhausted).toBe(false); // per-hand cap bit first
  });

  it('reports the per-game cap as exhausted and never goes negative', () => {
    const game = chattyGame();
    game.createdWithTier = 'free';
    const messages = Array.from({ length: limits.free.perGame + 5 }, (_, i) =>
      msg(i + 1, 'BOT_ANSWER', 'chat', 'Vex', i),
    );
    const budget = chatBudget(game, messages);
    expect(budget.gameExhausted).toBe(true);
    expect(budget.remaining).toBe(0);
  });
});

describe('shouldRouteReaction', () => {
  const budget = (remaining: number) => ({
    handUsed: 0,
    handLimit: 9,
    gameUsed: 0,
    gameLimit: 9,
    remaining,
    gameExhausted: false,
  });

  it('routes table talk at a quiet table with budget left', () => {
    expect(shouldRouteReaction(chattyGame(), budget(3))).toBe(true);
  });

  it('stays out of the way when replies are already queued', () => {
    const game = chattyGame();
    game.chatQueue = [{ actor: 'Vex', kind: 'CHAT_REPLY' }];
    expect(shouldRouteReaction(game, budget(3))).toBe(false);
  });

  it('skips the routing call entirely once the budget is spent', () => {
    expect(shouldRouteReaction(chattyGame(), budget(0))).toBe(false);
  });
});
