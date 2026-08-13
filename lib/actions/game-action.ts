import { auth } from '@/auth';
import { COLLECTIONS, db } from '@/lib/firebase/server';
import { Logger, logger } from '@/lib/logging/logger';
import { ERROR_FIELD } from '@/lib/game/retry';
import type { Game, GameErrorState, Lane, GameState } from '@/models/game';
import { coerceTier } from '@/models/user';

export interface ActionContext {
  userEmail: string;
  game: Game;
  logger: Logger;
  /**
   * Persist a failure the player is expected to act on (a model call that failed) without
   * throwing. The action returns normally with the error in its payload; the wrapper leaves
   * that lane's error in place so it both stops the lane and tells the next attempt what
   * went wrong.
   */
  recordFailure: (lane: Lane, state: Omit<GameErrorState, 'timestamp'>) => Promise<GameErrorState>;
}

export interface GameActionOptions {
  /** Reject unless the game is currently in one of these states. */
  expectState?: GameState[];
  /**
   * The lane this action drives — which error slot an unexpected crash is filed under.
   * A lane's error is never cleared implicitly: only an explicit retry consumes it (see
   * `consumeLaneError`), so a no-op call on a stopped lane can't be mistaken for recovery.
   */
  lane?: Lane;
}

export class ActionError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'UNAUTHENTICATED'
      | 'FORBIDDEN'
      | 'TIER_MISMATCH'
      | 'NOT_FOUND'
      | 'STALE'
      | 'INTERNAL',
  ) {
    super(message);
  }
}

/**
 * The one place cross-cutting concerns live: auth → load game → state guard → run
 * → park the lane on an unexpected crash → structured log. Server actions wrap their body
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

    if (game.createdBy !== session.user.email) {
      throw new ActionError('Not your table', 'FORBIDDEN');
    }

    // Werewolf's tier guard: a game keeps running only under the tier it was created
    // with. Free-tier games have caps a paid game doesn't, and billing keys off the
    // user's CURRENT tier — without this, downgrading to free would keep an expensive
    // paid-tier table running on the platform's dime. (Legacy 'api' games read as free.)
    const gameTier = coerceTier(game.createdWithTier);
    const userSnapshot = await db.collection(COLLECTIONS.users).doc(session.user.email).get();
    const userTier = coerceTier(userSnapshot.data()?.tier);
    if (gameTier !== userTier) {
      throw new ActionError(
        `This table was opened on the ${gameTier} tier, but your account is now on ${userTier}. ` +
          `Switch back to ${gameTier} on your profile page to keep playing it, or start a new table.`,
        'TIER_MISMATCH',
      );
    }

    if (options.expectState && !options.expectState.includes(game.status)) {
      throw new ActionError(`Expected ${options.expectState.join('|')}, got ${game.status}`, 'STALE');
    }

    const log = logger.with({ action: name, gameId, user: session.user.email });
    const started = Date.now();
    const recordFailure = async (lane: Lane, state: Omit<GameErrorState, 'timestamp'>) => {
      const errorState: GameErrorState = { ...state, timestamp: Date.now() };
      await ref.update({ [ERROR_FIELD[lane]]: errorState });
      log.warn('lane stopped — awaiting player retry', { lane, ...state });
      return errorState;
    };

    try {
      const result = await body(
        { userEmail: session.user.email, game, logger: log, recordFailure },
        ...args,
      );
      log.info('action completed', { durationMs: Date.now() - started });
      return result;
    } catch (error) {
      log.error('action failed', { error: String(error), durationMs: Date.now() - started });
      // Only a pump target's crash parks a lane. A validation or stale-call error from a
      // lane-less action (the human's own move, a retry setup) must not stop the table —
      // parking a lane is a heavy, sticky state that only an explicit retry clears.
      if (options.lane) {
        await ref.update({
          [ERROR_FIELD[options.lane]]: {
            message: 'Something went wrong on our side.',
            details: String(error),
            failedAction: name,
            retryable: true, // a crashed pump step is exactly what Retry re-runs
            timestamp: Date.now(),
          } satisfies GameErrorState,
        });
      }
      throw error;
    }
  };
}
