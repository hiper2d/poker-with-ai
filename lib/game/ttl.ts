/**
 * Table lifetime. Firestore TTL policies (on `poker_games.expireAt` and the `messages`
 * collection group, the latter shared with werewolf) delete a doc once its `expireAt`
 * passes — but only when the field is a Timestamp. A number or an ISO string is ignored.
 *
 * So `expireAt` is a storage-only field, outside the app's Game / GameMessage types:
 * - written as a Date at game creation, copied onto every message of that game (a TTL on
 *   the game doc does not reach its subcollection);
 * - never written back by `saveGame` (its JSON round-trip would turn the Timestamp into a
 *   plain map) and stripped from every doc before it reaches the client (a Timestamp is a
 *   class instance, which a server action cannot return).
 */
import { GAME_CONFIG } from '@/config/game';

export function gameExpiry(createdAt: number): Date {
  return new Date(createdAt + GAME_CONFIG.gameTtlDays * 24 * 60 * 60 * 1000);
}

/** The Date a stored `expireAt` stands for: a Timestamp, a Date, or a legacy epoch-ms number. */
export function expiryDate(stored: unknown): Date | undefined {
  if (stored instanceof Date) return stored;
  if (typeof stored === 'number' && stored > 0) return new Date(stored);
  if (stored && typeof (stored as { toDate?: unknown }).toDate === 'function') {
    return (stored as { toDate: () => Date }).toDate();
  }
  return undefined;
}

/** A doc as read from Firestore, minus the storage-only TTL field. */
export function withoutExpiry<T>(doc: T): T {
  if (!doc || typeof doc !== 'object' || !('expireAt' in doc)) return doc;
  const { expireAt: _expireAt, ...rest } = doc as T & { expireAt?: unknown };
  return rest as T;
}
