import { describe, expect, it } from 'vitest';
import { PIT_BOSS, type GameErrorState } from '@/models/game';
import { gameWith } from './test-fixtures';
import { effectiveModel, laneBlocked, laneRetry, retryNote } from './retry';

const failure = (over: Partial<GameErrorState> = {}): GameErrorState => ({
  message: "Vex couldn't respond — the model call failed.",
  details: 'context length exceeded',
  failedAction: 'advanceGame',
  actor: 'Vex',
  model: 'claude',
  retryable: true,
  timestamp: 0,
  ...over,
});

describe('effectiveModel', () => {
  it("uses the player's own model when no retry is pending", () => {
    expect(effectiveModel(gameWith({}), 'Vex', 'claude', 'game')).toBe('claude');
  });

  it('substitutes the retry plan\'s model for its target', () => {
    const game = gameWith({ gameRetry: { actor: 'Vex', hint: 'boom', model: 'gpt' } });
    expect(effectiveModel(game, 'Vex', 'claude', 'game')).toBe('gpt');
  });

  it('leaves everyone else on their own model', () => {
    const game = gameWith({ gameRetry: { actor: 'Vex', hint: 'boom', model: 'gpt' } });
    expect(effectiveModel(game, 'Mara', 'claude', 'game')).toBe('claude');
  });

  it('is a no-op for a plain retry that named no model', () => {
    const game = gameWith({ gameRetry: { actor: 'Vex', hint: 'boom' } });
    expect(effectiveModel(game, 'Vex', 'claude', 'game')).toBe('claude');
  });

  it('works for the Pit Boss, which is not a seated player', () => {
    const game = gameWith({ chatRetry: { actor: PIT_BOSS, hint: 'boom', model: 'gpt' } });
    expect(effectiveModel(game, PIT_BOSS, 'claude', 'chat')).toBe('gpt');
  });

  it('keeps the lanes separate — a chat retry never redirects a betting call', () => {
    const game = gameWith({ chatRetry: { actor: 'Vex', hint: 'boom', model: 'gpt' } });
    expect(effectiveModel(game, 'Vex', 'claude', 'game')).toBe('claude');
    expect(effectiveModel(game, 'Vex', 'claude', 'chat')).toBe('gpt');
  });
});

describe('laneBlocked', () => {
  it('stops only the lane that failed', () => {
    const game = gameWith({ chatError: failure() });
    expect(laneBlocked(game, 'chat')).toBe(true);
    expect(laneBlocked(game, 'game')).toBe(false);
  });

  it('is clear on a healthy game', () => {
    expect(laneBlocked(gameWith({}), 'game')).toBe(false);
    expect(laneBlocked(gameWith({}), 'chat')).toBe(false);
  });

  it('is clear once the error is swapped for a retry plan', () => {
    const game = gameWith({ gameRetry: { actor: 'Vex', hint: 'boom' } });
    expect(laneBlocked(game, 'game')).toBe(false);
  });
});

describe('retryNote', () => {
  it('is empty on a clean first attempt', () => {
    expect(retryNote(laneRetry(gameWith({}), 'game'), 'Vex')).toBe('');
  });

  it('tells the retried player what went wrong last time', () => {
    const game = gameWith({ gameRetry: { actor: 'Vex', hint: 'context length exceeded' } });
    const note = retryNote(laneRetry(game, 'game'), 'Vex');
    expect(note).toContain('PREVIOUS ATTEMPT');
    expect(note).toContain('context length exceeded');
  });

  it("does not leak one player's failure into another's prompt", () => {
    const game = gameWith({ gameRetry: { actor: 'Vex', hint: 'boom' } });
    expect(retryNote(laneRetry(game, 'game'), 'Mara')).toBe('');
  });

  it("does not carry a chat failure into the same bot's betting prompt", () => {
    const game = gameWith({ chatRetry: { actor: 'Vex', hint: 'boom' } });
    expect(retryNote(laneRetry(game, 'game'), 'Vex')).toBe('');
    expect(retryNote(laneRetry(game, 'chat'), 'Vex')).toContain('PREVIOUS ATTEMPT');
  });

  it('stays silent when the failure carried no usable detail', () => {
    const game = gameWith({ gameRetry: { actor: 'Vex', hint: '' } });
    expect(retryNote(laneRetry(game, 'game'), 'Vex')).toBe('');
  });

  it('stays silent for a hint-less plan — a model-override or transport-failure retry', () => {
    const game = gameWith({ gameRetry: { actor: 'Vex', model: 'gpt' } });
    expect(retryNote(laneRetry(game, 'game'), 'Vex')).toBe('');
  });
});
