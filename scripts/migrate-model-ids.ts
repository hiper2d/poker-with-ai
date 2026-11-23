// Rewrites model ids in poker_games docs that the current @hiper2d/ai-agents catalog and the
// free-tier price bands no longer allow. Covers gameMasterAiType, bots[].aiType and the
// per-lane retry/error model fields.
//
//  1. Retired ids → their catalog id (the runtime resolves these anyway via resolveModelId;
//     this makes the docs clean).
//  2. Free-tier games only: a model that has left the free tier → its free replacement. A catalog
//     slot can be repointed at a pricier model (gemini-flash: Gemini 3.8 Flash → Gemini 4 Hydrogen
//     in 0.35.0). Play never re-checks the tier, so such a bot would keep playing on platform keys
//     at the new price, while any model swap or retry-with-model at its table is rejected.
//
// Each game is then checked with the same validation a model swap runs; a table that still
// fails is reported and left for a hand fix.
//
// Preview:  npx tsx --env-file=.env scripts/migrate-model-ids.ts --dry-run
// Run:      npx tsx --env-file=.env scripts/migrate-model-ids.ts
import { LLM_CONSTANTS, resolveModelId } from '@/config/models';
import { getFreeTierPolicy } from '@/config/tiers';
import { COLLECTIONS, db } from '@/lib/firebase/server';
import { validateModelUsageForTier } from '@/lib/model-access';
import { coerceTier } from '@/models/user';

const DRY_RUN = process.argv.includes('--dry-run');

/** Where a free-tier seat moves when its model is no longer free. Same provider, free band. */
const FREE_TIER_REPLACEMENTS: Record<string, string> = {
  [LLM_CONSTANTS.GEMINI_FLASH]: LLM_CONSTANTS.GEMINI_LITE,
};

function migrate(modelId: string, freeGame: boolean): string {
  const id = resolveModelId(modelId);
  if (!freeGame || getFreeTierPolicy(id).available) return id;
  return FREE_TIER_REPLACEMENTS[id] ?? id;
}

async function main() {
  const snapshot = await db.collection(COLLECTIONS.games).get();
  let changed = 0;
  let invalid = 0;
  for (const doc of snapshot.docs) {
    const game = doc.data();
    const tier = coerceTier(game.createdWithTier);
    const free = tier === 'free';
    const update: Record<string, unknown> = {};
    const notes: string[] = [];
    const move = (where: string, from: string): string => {
      const to = migrate(from, free);
      if (to !== from) notes.push(`${where}: ${from} → ${to}`);
      return to;
    };

    const gm = move('GM', game.gameMasterAiType);
    if (gm !== game.gameMasterAiType) update.gameMasterAiType = gm;

    let bots: { name: string; aiType: string }[] = Array.isArray(game.bots) ? game.bots : [];
    const moved = bots.map((bot) => ({ ...bot, aiType: move(bot.name, bot.aiType) }));
    if (moved.some((b, i) => b.aiType !== bots[i].aiType)) update.bots = bots = moved;

    for (const field of ['gameRetry', 'chatRetry', 'gameError', 'chatError'] as const) {
      const value = game[field];
      if (!value?.model) continue;
      const model = move(field, value.model);
      if (model !== value.model) update[field] = { ...value, model };
    }

    let problem: string | null = null;
    try {
      validateModelUsageForTier(tier, gm, bots.map((b) => b.aiType));
    } catch (error) {
      problem = (error as Error).message;
      invalid++;
    }

    if (Object.keys(update).length === 0 && !problem) continue;
    console.log(`${DRY_RUN ? '[dry-run] ' : ''}${doc.id} (${tier})`);
    for (const note of notes) console.log(`    ${note}`);
    if (problem) console.log(`    STILL INVALID after migration: ${problem}`);
    if (Object.keys(update).length === 0) continue;
    changed++;
    if (!DRY_RUN) await doc.ref.update(update);
  }
  console.log(`${changed} of ${snapshot.size} games ${DRY_RUN ? 'would change' : 'updated'}; ${invalid} still invalid.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
