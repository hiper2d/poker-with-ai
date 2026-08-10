/**
 * Chat responder selection — pure, RNG injectable for tests.
 *
 * Current strategy (pre-LLM-router): bots whose name appears in the message reply;
 * otherwise 1-2 random live bots. When the werewolf GM-router port lands, this module
 * keeps this function as its fallback path (router unavailable/failed → this).
 */
import type { Bot, Game } from '@/models/game';

export interface ResponderPick {
  responders: Bot[];
  trigger: 'mention' | 'router';
}

export function liveBots(game: Game): Bot[] {
  return game.bots.filter(
    (b) => game.seats.find((s) => s.name === b.name)?.status === 'active',
  );
}

export function pickResponders(
  game: Game,
  text: string,
  rng: () => number = Math.random,
): ResponderPick {
  const live = liveBots(game);
  const lowered = text.toLowerCase();
  const mentioned = live.filter((b) => lowered.includes(b.name.toLowerCase()));
  if (mentioned.length) return { responders: mentioned, trigger: 'mention' };

  const shuffled = [...live].sort(() => rng() - 0.5);
  return { responders: shuffled.slice(0, rng() < 0.5 ? 1 : 2), trigger: 'router' };
}
