// Gives poker_games docs (and their messages) a Firestore Timestamp `expireAt`, which is
// what a TTL policy reads; games written before 2026-10-31 stored an epoch-ms number that
// TTL ignores, and their messages had no expireAt at all (lib/game/ttl.ts).
//
// Games whose stored expiry is a number or missing get a FRESH expiry, gameTtlDays from
// now — not their creation-based one, which had already passed for most of them when this
// first ran. Games that already hold a Timestamp keep it; their messages are brought in line.
// Re-runnable: run it again after deploying the code that writes Timestamps, to catch games
// created in between.
//
// Preview:  npx tsx --env-file=.env scripts/backfill-ttl.ts --dry-run
// Run:      npx tsx --env-file=.env scripts/backfill-ttl.ts
import { Timestamp } from 'firebase-admin/firestore';
import { COLLECTIONS, db } from '@/lib/firebase/server';
import { gameExpiry } from '@/lib/game/ttl';

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_LIMIT = 450; // Firestore caps a batch at 500 writes

async function main() {
  const freshExpiry = gameExpiry(Date.now());
  const games = await db.collection(COLLECTIONS.games).get();
  let gamesChanged = 0;
  let messagesChanged = 0;

  for (const game of games.docs) {
    const stored = game.data().expireAt;
    const keep = stored instanceof Timestamp;
    const expireAt = keep ? stored.toDate() : freshExpiry;

    const messages = await game.ref.collection('messages').get();
    const stale = messages.docs.filter((m) => {
      const current = m.data().expireAt;
      return !(current instanceof Timestamp) || current.toMillis() !== expireAt.getTime();
    });
    if (keep && stale.length === 0) continue;

    console.log(
      `${DRY_RUN ? '[dry-run] ' : ''}${game.id}: game ${keep ? 'keeps' : `${JSON.stringify(stored)} →`} ${expireAt.toISOString()}, ${stale.length}/${messages.size} messages`,
    );
    if (!keep) gamesChanged++;
    messagesChanged += stale.length;
    if (DRY_RUN) continue;

    if (!keep) await game.ref.update({ expireAt });
    for (let i = 0; i < stale.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      for (const m of stale.slice(i, i + BATCH_LIMIT)) batch.update(m.ref, { expireAt });
      await batch.commit();
    }
  }
  console.log(
    `${games.size} games: ${gamesChanged} game docs and ${messagesChanged} messages ${DRY_RUN ? 'would change' : 'updated'}.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
