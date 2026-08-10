import { describe, expect, it } from 'vitest';
import { gameWith } from './test-fixtures';
import { liveBots, pickResponders } from './chat-router';

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

describe('pickResponders', () => {
  it('mentioned bots reply, case-insensitively', () => {
    const { responders, trigger } = pickResponders(chattyGame(), 'nice bluff, VEX!');
    expect(responders.map((b) => b.name)).toEqual(['Vex']);
    expect(trigger).toBe('mention');
  });

  it('multiple mentions all reply', () => {
    const { responders } = pickResponders(chattyGame(), 'vex and mara, you two are in cahoots');
    expect(responders.map((b) => b.name).sort()).toEqual(['Mara', 'Vex']);
  });

  it('eliminated bots never reply even when mentioned', () => {
    const game = gameWith({}); // Mara eliminated
    const { responders, trigger } = pickResponders(game, 'mara, you there?', () => 0.9);
    // no live bot mentioned → falls back to the random pick among live bots
    expect(trigger).toBe('router');
    expect(responders.every((b) => b.name !== 'Mara')).toBe(true);
  });

  it('unaddressed messages get 1-2 random live responders', () => {
    const one = pickResponders(chattyGame(), 'anyone folding tonight?', () => 0.1);
    expect(one.trigger).toBe('router');
    expect(one.responders).toHaveLength(1);

    const two = pickResponders(chattyGame(), 'anyone folding tonight?', () => 0.9);
    expect(two.responders).toHaveLength(2);
  });

  it('returns nobody at an empty table', () => {
    const game = gameWith({});
    game.seats = game.seats.map((s) => (s.isHuman ? s : { ...s, status: 'eliminated' as const }));
    expect(pickResponders(game, 'hello?').responders).toEqual([]);
  });
});
