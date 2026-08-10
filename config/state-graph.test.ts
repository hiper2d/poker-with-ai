import { describe, expect, it } from 'vitest';
import { gameWith, msg } from '@/lib/game/test-fixtures';
import type { GameMessage, Seat } from '@/models/game';
import { GAME_STATES } from '@/models/game';
import { nextState, STATE_GRAPH } from './state-graph';

const longChat = (count: number): GameMessage[] =>
  Array.from({ length: count }, (_, i) => msg(i + 1, 'TABLE_TALK', 'x'.repeat(400)));

const soloSeats: Seat[] = [
  { seatIndex: 0, name: 'Paul', isHuman: true, stack: 20000, status: 'active' },
  { seatIndex: 1, name: 'Vex', isHuman: false, stack: 0, status: 'eliminated', eliminatedInHand: 4 },
  { seatIndex: 2, name: 'Mara', isHuman: false, stack: 0, status: 'eliminated', eliminatedInHand: 2 },
];

describe('state graph', () => {
  it('covers every state with a defined successor', () => {
    for (const state of Object.values(GAME_STATES)) {
      expect(STATE_GRAPH[state]).toBeDefined();
    }
  });

  it('WELCOME deals straight into BETTING (intros ride the chat queue)', () => {
    expect(nextState(gameWith({ status: 'WELCOME' }))).toBe(GAME_STATES.BETTING);
  });

  it('BETTING loops until the hand completes, then settles', () => {
    const inProgress = gameWith({ status: 'BETTING' });
    inProgress.hand = { complete: false } as never;
    expect(nextState(inProgress)).toBe(GAME_STATES.BETTING);
    inProgress.hand = { complete: true } as never;
    expect(nextState(inProgress)).toBe(GAME_STATES.HAND_RESULTS);
  });

  it('HAND_RESULTS ends the game when fewer than two seats live', () => {
    const game = gameWith({ status: 'HAND_RESULTS', seats: soloSeats });
    expect(nextState(game, longChat(10))).toBe(GAME_STATES.GAME_OVER);
  });

  it('HAND_RESULTS routes through COMPACTION when bots have memory work', () => {
    // handNumber 4 = interval boundary, plenty of fresh chat
    const game = gameWith({ status: 'HAND_RESULTS', handNumber: 4 });
    expect(nextState(game, longChat(3))).toBe(GAME_STATES.COMPACTION);
  });

  it('HAND_RESULTS deals the next hand when nothing needs compacting', () => {
    const game = gameWith({ status: 'HAND_RESULTS', handNumber: 3 });
    expect(nextState(game, [msg(1, 'TABLE_TALK', 'gg')])).toBe(GAME_STATES.BETTING);
  });

  it('COMPACTION drains its queue one event at a time, then deals', () => {
    const game = gameWith({
      status: 'COMPACTION',
      gameQueue: [{ actor: 'Vex', kind: 'COMPACT_CHAT' }],
    });
    expect(nextState(game)).toBe(GAME_STATES.COMPACTION);
    game.gameQueue = [];
    expect(nextState(game)).toBe(GAME_STATES.BETTING);
  });

  it('GAME_OVER is terminal', () => {
    expect(nextState(gameWith({ status: 'GAME_OVER' }))).toBe(GAME_STATES.GAME_OVER);
  });
});
