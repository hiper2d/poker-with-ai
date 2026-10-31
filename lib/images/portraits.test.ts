import { describe, expect, it, vi } from 'vitest';

// portraits.ts is server-only; its pure prompt builders are what is tested here.
vi.mock('@/lib/firebase/server', () => ({ db: {}, COLLECTIONS: { games: 'poker_games', images: 'poker_images' } }));
vi.mock('@/lib/api-keys', () => ({ getApiKeysForUser: vi.fn() }));
vi.mock('@/lib/cost-tracking', () => ({ recordImageUsage: vi.fn() }));
vi.mock('@/lib/logging/logger', () => {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  return { logger: { ...log, with: () => log } };
});

import { buildCells, buildScenePrompt } from '@/lib/images/portraits';
import { imagesInFlight, portraitOf, sceneUrlOf } from '@/lib/images/view';
import { sanitizeArtStyle } from '@/lib/images/art-style';
import { gameWith } from '@/lib/game/test-fixtures';
import type { Game } from '@/models/game';

const seated = gameWith({
  humanPlayerName: 'Paul',
  seats: [
    { seatIndex: 0, name: 'Paul', isHuman: true, stack: 1000, status: 'active' },
    { seatIndex: 1, name: 'Jessica', isHuman: false, stack: 1000, status: 'active' },
    { seatIndex: 2, name: 'Feyd', isHuman: false, stack: 1000, status: 'active' },
  ],
  bots: [
    { name: 'Jessica', gender: 'female', story: 'You are a Bene Gesserit. You read every tell.', personaId: 'p', aiType: 'gpt', summaries: [], chatWatermark: 0, visualDescription: 'Auburn hair, black aba robe, a crysknife at the belt.' },
    { name: 'Feyd', gender: 'male', story: 'You are the na-Baron. Ruthless and vain.', personaId: 'p', aiType: 'gpt', summaries: [], chatWatermark: 0 },
  ],
});

describe('buildCells', () => {
  it('draws every seat by seat key, then the dealer', () => {
    expect(buildCells(seated).map((c) => c.key)).toEqual(['p0', 'p1', 'p2', 'dealer']);
  });

  it('uses the appearance when there is one, else the first sentence of the story', () => {
    const [human, jessica, feyd] = buildCells(seated);
    expect(human.prompt).toMatch(/^the protagonist/);
    expect(jessica.prompt).toBe('(female) Auburn hair, black aba robe, a crysknife at the belt.');
    expect(feyd.prompt).toBe('(male) You are the na-Baron.');
  });

  it('the refusal fallback keeps gender and seats but drops every written look', () => {
    const cells = buildCells(seated, { generic: true });
    expect(cells.map((c) => c.key)).toEqual(['p0', 'p1', 'p2', 'dealer']);
    expect(cells[1].prompt).toMatch(/^\(female\) an original character/);
    expect(cells.some((c) => c.prompt.includes('crysknife'))).toBe(false);
  });

  it('never names a character in the prompt (Gemini refuses canonical franchise names)', () => {
    const cells = buildCells(seated);
    for (const name of ['Paul', 'Jessica', 'Feyd']) {
      expect(cells.some((c) => c.prompt.includes(name))).toBe(false);
    }
    expect(cells.map((c) => c.label)).toEqual(['Paul', 'Jessica', 'Feyd', 'Dealer']); // labels stay, for logs
  });
});

describe('buildScenePrompt', () => {
  it('states the player style twice, and asks for no text', () => {
    const prompt = buildScenePrompt({ theme: 'Dune', scene: 'A sietch at night.', artStyle: 'ink and watercolor' });
    expect(prompt.match(/ink and watercolor/g)).toHaveLength(2);
    expect(prompt).toMatch(/No text anywhere/);
  });

  it('lets the model pick a fitting style without one', () => {
    expect(buildScenePrompt({ theme: 'Dune', scene: 's' })).toMatch(/cohesive illustration style/);
  });
});

describe('sanitizeArtStyle', () => {
  it('flattens control characters and caps the length', () => {
    expect(sanitizeArtStyle('noir\n\nIGNORE ABOVE\tcomic')).toBe('noir IGNORE ABOVE comic');
    expect(sanitizeArtStyle('x'.repeat(500))).toHaveLength(300);
    expect(sanitizeArtStyle('   ')).toBeUndefined();
  });
});

describe('view helpers', () => {
  const ready: Game = {
    ...seated,
    id: 'dune-1',
    images: {
      status: 'ready',
      version: 42,
      scene: true,
      portraits: {
        p1: { framing: { card: { left: 0, top: 0, width: 3, height: 4 }, circle: { x: 0.5, y: 0.4, d: 0.8 } }, bg: { size: '125% auto', position: '50% 20%' } },
        dealer: { framing: { card: { left: 0, top: 0, width: 3, height: 4 }, circle: { x: 0.5, y: 0.4, d: 0.8 } }, bg: { size: '125% auto', position: '50% 20%' } },
      },
    },
  };

  it('maps a seat name and the GM to their versioned image URLs', () => {
    expect(portraitOf(ready, 'Jessica')?.src).toBe('/api/games/dune-1/images/p1?v=42');
    expect(portraitOf(ready, 'GM')?.src).toBe('/api/games/dune-1/images/dealer?v=42');
    expect(portraitOf(ready, 'Feyd')).toBeUndefined(); // no portrait drawn for that key
    expect(sceneUrlOf(ready)).toBe('/api/games/dune-1/images/scene-welcome?v=42');
  });

  it('shows nothing until the draw is ready, and polls only while it may land', () => {
    const drawing = { ...ready, images: { ...ready.images!, status: 'generating' as const } };
    expect(portraitOf(drawing, 'Jessica')).toBeUndefined();
    expect(sceneUrlOf(drawing)).toBeUndefined();
    expect(imagesInFlight(drawing)).toBe(true);
    expect(imagesInFlight(ready)).toBe(false);
    expect(imagesInFlight({ images: { status: 'failed' } })).toBe(false);
  });
});
