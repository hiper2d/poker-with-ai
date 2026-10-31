import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { GAME_CONFIG } from '@/config/game';
import { expiryDate, gameExpiry, withoutExpiry } from '@/lib/game/ttl';
import { sanitizeGame } from '@/lib/game/sanitize';
import { gameWith } from '@/lib/game/test-fixtures';

describe('table TTL', () => {
  it('expires a table gameTtlDays after creation, as a Date', () => {
    const created = Date.UTC(2026, 9, 1);
    expect(gameExpiry(created).getTime()).toBe(created + GAME_CONFIG.gameTtlDays * 86_400_000);
  });

  it('reads a stored Timestamp, Date or legacy number back as a Date', () => {
    const at = new Date('2026-11-30T00:00:00Z');
    expect(expiryDate(Timestamp.fromDate(at))).toEqual(at);
    expect(expiryDate(at)).toBe(at);
    expect(expiryDate(at.getTime())).toEqual(at);
    expect(expiryDate(undefined)).toBeUndefined();
    expect(expiryDate(0)).toBeUndefined();
  });

  it('a JSON round-trip loses the Date — why expireAt is added after stripUndefined', () => {
    // stripUndefined is JSON.parse(JSON.stringify(x)) (lib/firebase/server.ts)
    expect(typeof JSON.parse(JSON.stringify({ expireAt: new Date() })).expireAt).toBe('string');
  });

  it('never sends the storage-only Timestamp to the client', () => {
    const stored = { ...gameWith({}), expireAt: Timestamp.now() };
    expect('expireAt' in sanitizeGame(stored)).toBe(false);
    expect(withoutExpiry({ id: 'm', expireAt: Timestamp.now() })).toEqual({ id: 'm' });
  });
});
