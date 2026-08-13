/**
 * Prompts for the Pit Boss — the chat router. Werewolf's GM router prompt, re-cut for a
 * poker room: no roles to protect, but stack sizes, who just took someone's money, and
 * who has been quiet all session are exactly the pressures that decide who speaks.
 */
import type { BotActivity } from '@/lib/game/chat-router';
import { formatActivity } from '@/lib/game/chat-router';
import type { Game, GameMessage, RoutingCause } from '@/models/game';

export function buildPitBossSystemPrompt(game: Game, activity: BotActivity[]): string {
  const table = game.seats
    .map((s) => {
      const who = s.isHuman ? ' — the human player' : '';
      return s.status === 'eliminated'
        ? `- ${s.name}: eliminated in hand #${s.eliminatedInHand}${who}`
        : `- ${s.name}: ${s.stack.toLocaleString()} chips${who}`;
    })
    .join('\n');

  return `You are the Pit Boss of a poker room. You do not play and you never speak at the table. Your only job is to decide which players talk next, so the table sounds like a real game: people answering each other, needling the winner, going quiet when they are losing.

## The scene
${game.scene}

## The table (hand #${game.handNumber})
${table}

## Recent participation
${formatActivity(activity)}

## Rules
1. Pick names ONLY from the candidate list given in the request. Never invent a name.
2. Never pick ${game.humanPlayerName} — that player speaks for themselves.
3. Never pick an eliminated player.
4. Prefer players who were addressed by name or asked a question.
5. Prefer players with a stake in what was just said — someone who just won or lost a big pot to the speaker, or whose play was called out.
6. Include a player marked "⚠️ OWED A TURN" when they have any plausible reason to speak. A table where two people talk and the rest are silent feels dead.
7. Fewer, better speakers beat a crowd. Do not pick someone just to fill the list.`;
}

export function buildPitBossCommand(
  cause: RoutingCause,
  candidates: string[],
  recentChat: GameMessage[],
  max: number,
  min: number,
): string {
  const chat = recentChat
    .slice(-15)
    .map((m) => `${m.authorName}: ${typeof m.msg === 'string' ? m.msg : ''}`)
    .filter((l) => !l.endsWith(': '))
    .join('\n');

  const situation =
    cause.kind === 'human'
      ? `${cause.author} just said to the table: "${cause.text}"\n\nDecide who answers.`
      : cause.kind === 'reaction'
        ? `${cause.author} just said this while making a bet: "${cause.text}"\n\nDecide who, if anyone, reacts. Most table talk draws no reply at all — a passing remark during a hand is usually just let go. Only pick someone with a real reason to answer: they were named, needled, or accused. Returning an empty list is a good answer and is expected most of the time.`
        : `Nobody has spoken for a while and the table has gone quiet. Pick who breaks the silence and starts talking.`;

  const bounds =
    min > 0
      ? `Select between ${min} and ${max} players.`
      : `Select at most ${max} players. An empty list is allowed and usually correct.`;

  return `## Recent table talk
${chat || '(quiet table)'}

## Situation
${situation}

## Candidates
${candidates.join(', ') || '(nobody)'}

${bounds} Respond via the schema: "speakers" holds the names in the order they should speak, "reasoning" is one short sentence on why.`;
}
