import { describe, expect, it } from 'vitest';
import {
  buildCompactionEvents,
  estimateTokens,
  messageCounterOf,
  unsummarizedChat,
} from './compaction';
import { gameWith, msg } from './test-fixtures';

describe('messageCounterOf', () => {
  it('parses the counter prefix and tolerates missing ids', () => {
    expect(messageCounterOf(msg(123, 'TABLE_TALK', 'hi'))).toBe(123);
    expect(messageCounterOf({ ...msg(1, 'TABLE_TALK', 'hi'), id: undefined })).toBe(0);
  });
});

describe('unsummarizedChat', () => {
  it('keeps only chat-type messages above the watermark', () => {
    const messages = [
      msg(1, 'TABLE_TALK', 'old talk'),
      msg(2, 'GAME_ACTION', 'Vex folds.'),
      msg(3, 'TABLE_TALK', 'new talk'),
      msg(4, 'HUMAN_PLAYER_MESSAGE', 'hello', 'Paul'),
    ];
    const fresh = unsummarizedChat(messages, 1);
    expect(fresh.map(messageCounterOf)).toEqual([3, 4]);
  });
});

describe('buildCompactionEvents', () => {
  const longChat = (from: number, count: number) =>
    Array.from({ length: count }, (_, i) => msg(from + i, 'TABLE_TALK', 'x'.repeat(400)));

  it('queues COMPACT_CHAT for live bots with enough chat on an interval boundary', () => {
    const game = gameWith({ handNumber: 4 });
    const events = buildCompactionEvents(game, longChat(1, 3));
    // Mara is eliminated — only Vex compacts
    expect(events).toEqual([{ actor: 'Vex', kind: 'COMPACT_CHAT' }]);
  });

  it('skips quiet tables on interval boundaries', () => {
    const game = gameWith({ handNumber: 4 });
    expect(buildCompactionEvents(game, [msg(1, 'TABLE_TALK', 'gg')])).toEqual([]);
  });

  it('does nothing off-interval below the hard threshold', () => {
    const game = gameWith({ handNumber: 3 });
    expect(buildCompactionEvents(game, longChat(1, 3))).toEqual([]);
  });

  it('forces compaction off-interval past the hard threshold', () => {
    const game = gameWith({ handNumber: 3 });
    // 6000 tokens ≈ 24k chars → 61 messages × 400 chars
    expect(buildCompactionEvents(game, longChat(1, 61))).toEqual([
      { actor: 'Vex', kind: 'COMPACT_CHAT' },
    ]);
  });

  it('respects per-bot watermarks', () => {
    const game = gameWith({ handNumber: 4 });
    game.bots[0].chatWatermark = 100; // Vex already absorbed everything
    expect(buildCompactionEvents(game, longChat(1, 3))).toEqual([]);
  });

  it('queues COMPACT_CONTEXT when summaries alone outgrow the budget', () => {
    const game = gameWith({ handNumber: 5 }); // off-interval, no new chat
    game.bots[0].summaries = ['y'.repeat(60_000)]; // ~15k tokens > 12k threshold
    expect(buildCompactionEvents(game, [])).toEqual([
      { actor: 'Vex', kind: 'COMPACT_CONTEXT' },
    ]);
  });
});

describe('estimateTokens', () => {
  it('uses the chars/4 heuristic', () => {
    expect(estimateTokens('abcdefgh')).toBe(2);
    expect(estimateTokens('')).toBe(0);
  });
});
