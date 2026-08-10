// Live smoke test: one real GM story-gen call. Usage:
//   npx tsx --env-file=.env scripts/test-story-gen.ts [modelId]
import { createAgent } from '@/lib/ai/agent-factory';
import {
  buildStoryGenSystemPrompt,
  buildStoryGenUserPrompt,
  StoryGenSchema,
} from '@/lib/ai/prompts/story-gen';
import { ENV_KEY_FALLBACKS, type ApiKeyMap, type ApiKeyName } from '@/config/models';

const modelId = process.argv[2] ?? 'claude';
const apiKeys: ApiKeyMap = {};
for (const [keyName, envVar] of Object.entries(ENV_KEY_FALLBACKS)) {
  if (process.env[envVar]) apiKeys[keyName as ApiKeyName] = process.env[envVar];
}

async function main() {
  const gm = createAgent('GM', buildStoryGenSystemPrompt(), modelId, apiKeys);
  const reply = await gm.askWithSchema(StoryGenSchema, [
    { role: 'user', content: buildStoryGenUserPrompt('Dune', 'Paul', 2) },
  ]);
  console.log(JSON.stringify(reply.content, null, 2));
  console.log(`model=${modelId} durationMs=${reply.durationMs} usage=${JSON.stringify(reply.usage)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
