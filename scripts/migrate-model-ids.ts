// Rewrites retired model ids in poker_games docs to the @hiper2d/ai-agents catalog ids
// (the runtime resolves them anyway via resolveModelId; this makes the docs clean).
// Covers gameMasterAiType, bots[].aiType and the per-lane retry/error model fields.
//
// Preview:  npx tsx --env-file=.env scripts/migrate-model-ids.ts --dry-run
// Run:      npx tsx --env-file=.env scripts/migrate-model-ids.ts
import { resolveModelId } from '@/config/models';
import { COLLECTIONS, db } from '@/lib/firebase/server';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const snapshot = await db.collection(COLLECTIONS.games).get();
  let changed = 0;
  for (const doc of snapshot.docs) {
    const game = doc.data();
    const update: Record<string, unknown> = {};

    const gm = resolveModelId(game.gameMasterAiType);
    if (gm !== game.gameMasterAiType) update.gameMasterAiType = gm;

    if (Array.isArray(game.bots)) {
      const bots = game.bots.map((bot: { aiType: string }) => ({ ...bot, aiType: resolveModelId(bot.aiType) }));
      if (bots.some((b: { aiType: string }, i: number) => b.aiType !== game.bots[i].aiType)) update.bots = bots;
    }

    for (const field of ['gameRetry', 'chatRetry', 'gameError', 'chatError'] as const) {
      const value = game[field];
      if (value?.model && resolveModelId(value.model) !== value.model) {
        update[field] = { ...value, model: resolveModelId(value.model) };
      }
    }

    if (Object.keys(update).length === 0) continue;
    changed++;
    console.log(`${DRY_RUN ? '[dry-run] ' : ''}${doc.id}: ${JSON.stringify(Object.keys(update))}`);
    if (!DRY_RUN) await doc.ref.update(update);
  }
  console.log(`${changed} of ${snapshot.size} games ${DRY_RUN ? 'would change' : 'updated'}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
