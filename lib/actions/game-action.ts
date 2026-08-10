import { auth } from '@/auth';
import { COLLECTIONS, db } from '@/lib/firebase/server';
import { Logger, logger } from '@/lib/logging/logger';
import type { Game, GameState } from '@/models/game';

export interface ActionContext {
  userEmail: string;
  game: Game;
  logger: Logger;
}

export interface GameActionOptions {
  /** Reject unless the game is currently in one of these states. */
  expectState?: GameState[];
}

export class ActionError extends Error {
  constructor(
    message: string,
    public readonly code: 'UNAUTHENTICATED' | 'NOT_FOUND' | 'STALE' | 'INTERNAL',
  ) {
    super(message);
  }
}

/**
 * The one place cross-cutting concerns live: auth → load game → state guard → run
 * → persist errorState on failure → structured log. Server actions wrap their body
 * with this instead of re-implementing the pipeline.
 *
 * TODO(skeleton): stale-action no-op guard (double-fired pump calls resync instead of
 * erroring) and per-call cost tracking hook.
 */
export function gameAction<TArgs extends unknown[], TResult>(
  name: string,
  options: GameActionOptions,
  body: (ctx: ActionContext, ...args: TArgs) => Promise<TResult>,
): (gameId: string, ...args: TArgs) => Promise<TResult> {
  return async (gameId: string, ...args: TArgs): Promise<TResult> => {
    const session = await auth();
    if (!session?.user?.email) throw new ActionError('Not authenticated', 'UNAUTHENTICATED');

    const ref = db.collection(COLLECTIONS.games).doc(gameId);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw new ActionError(`Game ${gameId} not found`, 'NOT_FOUND');
    const game = snapshot.data() as Game;

    if (options.expectState && !options.expectState.includes(game.status)) {
      throw new ActionError(`Expected ${options.expectState.join('|')}, got ${game.status}`, 'STALE');
    }

    const log = logger.with({ action: name, gameId, user: session.user.email });
    const started = Date.now();
    try {
      const result = await body({ userEmail: session.user.email, game, logger: log }, ...args);
      if (game.errorState) await ref.update({ errorState: null }); // recovered
      log.info('action completed', { durationMs: Date.now() - started });
      return result;
    } catch (error) {
      log.error('action failed', { error: String(error), durationMs: Date.now() - started });
      await ref.update({
        errorState: { message: String(error), failedAction: name, timestamp: Date.now() },
      });
      throw error;
    }
  };
}
