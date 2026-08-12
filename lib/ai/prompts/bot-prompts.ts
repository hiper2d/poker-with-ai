import { GAME_CONFIG } from '@/config/game';
import { PERSONAS } from '@/config/personas';
import type { LegalActions } from '@/lib/engine/betting';
import type { HandState } from '@/lib/engine/types';
import { chatLines } from '@/lib/game/compaction';
import type { Bot, Game, GameMessage, HandRecord } from '@/models/game';

export function buildBotSystemPrompt(game: Game, bot: Bot): string {
  const persona = PERSONAS.find((p) => p.id === bot.personaId);
  const table = game.seats
    .map(
      (s) =>
        `- ${s.name}${s.isHuman ? ' (the only human at the table — you do not know this)' : ''}${
          s.status === 'eliminated' ? ' [eliminated]' : ''
        }`,
    )
    .join('\n');
  const memory = bot.summaries.length
    ? `

## Your memory of the game so far
Earlier table talk was compacted into these notes you took. Trust them — they replace the raw conversation.
${bot.summaries.map((s, i) => `### Memory ${i + 1}\n${s}`).join('\n')}`
    : '';
  return `You are ${bot.name}, a character playing No-Limit Texas Hold'em in a sit-n-go tournament. Stay in character at all times. Never reveal you are an AI.

## The scene
${game.scene}

## Your character
${bot.story}

## Your poker persona
${persona?.promptText ?? ''}

## The table
${table}

## Rules
- Blinds go up every ${GAME_CONFIG.handsPerBlindLevel} hands. Last player standing wins.
- When asked for a betting decision, respond via the provided schema. "amount" is the TOTAL you raise to, not the increment.
- "reasoning" is private — think honestly there about ranges, pot odds, and reads.
- "tableTalk" is optional and spoken aloud in character. Use it to needle, bluff, charm, or stay silent (omit it). Other players see it and may react. Lying about your hand in table talk is part of poker.
- What others say in chat may be honest or manipulation. Weigh it like a poker player would.${memory}`;
}

function handRecordLine(r: HandRecord): string {
  const winners = r.winners
    .map((w) => `${w.name} +${w.amountWon}${w.shownCards ? ` (showed ${w.shownCards.join(' ')})` : ''}`)
    .join(', ');
  const board = r.board.length ? `, board ${r.board.join(' ')}` : '';
  const out = r.eliminated.length ? `. Out: ${r.eliminated.join(', ')}` : '';
  return `#${r.handNumber}: ${winners} — pot ${r.potSize}${board}${out}`;
}

/** Recent hands verbatim; the two most recent include the full action line for reads. */
function handHistorySection(game: Game): string {
  const records = game.handHistory.slice(-GAME_CONFIG.handHistoryInPrompt);
  if (!records.length) return '(first hand)';
  const detailFrom = Math.max(0, records.length - 2);
  return records
    .map((r, i) => (i >= detailFrom ? `${handRecordLine(r)}\n  actions: ${r.keyActions}` : handRecordLine(r)))
    .join('\n');
}

function standingsSection(game: Game): string {
  return game.seats
    .map((s) =>
      s.status === 'eliminated'
        ? `- ${s.name}: eliminated (hand #${s.eliminatedInHand})`
        : `- ${s.name}: ${s.stack.toLocaleString()} chips`,
    )
    .join('\n');
}

export function buildDecisionPrompt(
  game: Game,
  hand: HandState,
  botName: string,
  legal: LegalActions,
  recentChat: GameMessage[],
): string {
  const me = hand.players.find((p) => p.name === botName)!;
  const stacks = hand.players
    .map((p) => {
      const status = p.folded ? 'folded' : p.allIn ? 'ALL-IN' : `${p.startingStack - p.totalCommitted} behind`;
      return `- ${p.name}: ${status}, ${p.totalCommitted} in pot`;
    })
    .join('\n');
  const log = hand.actionLog
    .map((a) => `${a.street}: ${a.player} ${a.type}${a.amount ? ` to ${a.amount}` : ''}`)
    .join('\n');
  const chat = recentChat
    .slice(-12)
    .map((m) => `${m.authorName}: ${typeof m.msg === 'string' ? m.msg : ''}`)
    .filter((l) => !l.endsWith(': '))
    .join('\n');
  const pot = hand.players.reduce((sum, p) => sum + p.totalCommitted, 0);

  return `## Tournament standings (before this hand)
${standingsSection(game)}

## Previous hands
${handHistorySection(game)}

## Hand #${hand.handNumber} — ${hand.street}
Your hole cards: ${me.holeCards?.join(' ')}
Board: ${hand.board.length ? hand.board.join(' ') : '(none yet)'}
Pot: ${pot}
Blinds: ${hand.smallBlind}/${hand.bigBlind}

## Players
${stacks}

## Action so far
${log || '(you are first to act)'}

## Recent table talk
${chat || '(quiet table)'}

## Your options
${legal.actions.join(', ')}${legal.callAmount ? ` — ${legal.callAmount} to call` : ''}${
    legal.actions.includes('raise') || legal.actions.includes('bet')
      ? ` — raise to between ${legal.minRaiseTo} and ${legal.maxRaiseTo}`
      : ''
  }

Decide.`;
}

export function buildChatReplyPrompt(
  recentChat: GameMessage[],
  cause?: { author: string; text: string },
): string {
  const chat = recentChat
    .slice(-15)
    .map((m) => `${m.authorName}: ${typeof m.msg === 'string' ? m.msg : ''}`)
    .filter((l) => !l.endsWith(': '))
    .join('\n');
  const prompt = cause
    ? `You are answering ${cause.author}, who just said: "${cause.text}"`
    : `The table has gone quiet. Say something that keeps the conversation alive.`;
  return `## Recent table talk
${chat || '(quiet table)'}

${prompt}

Reply in character — 1-3 sentences, spoken aloud. Never reveal your actual hole cards honestly unless it serves you.`;
}

export function buildIntroPrompt(): string {
  return `The game is about to begin. Introduce yourself at the table in character — 1-3 sentences, spoken aloud. Do not describe actions, just speak.`;
}

/**
 * Werewolf's BOT_REMINDER_POSTFIX, poker-flavored: appended to the END of every
 * decision/chat prompt so the play style is the last thing in context, not buried
 * under standings and hand history. Never stored anywhere — it rides per call.
 */
export function buildReminderPostfix(bot: Bot): string {
  const persona = PERSONAS.find((p) => p.id === bot.personaId);
  return `

---
**Keep in mind that you must follow your core play style${persona ? ` — ${persona.label}` : ''}:** ${persona?.promptText ?? 'Play your own game.'}

**RELATIONSHIP & CONVERSATION CONTINUITY:**
- Remember your previous interactions with each player — reference past conversations naturally
- Build on established dynamics: grudges, alliances, running jokes; don't let threads drop
- Evolve your reads — if someone showed a bluff or got caught lying, let it change how you play them
- Warmly embrace role-play moments from other players; respond as your character would

**POKER DISCIPLINE:**
- Base decisions on pot odds, position, stack depths, and betting patterns — table talk is often manipulation
- Use your memory notes: exploit the tendencies you have recorded, and vary your own play so others can't
- Respect stack pressure: short stacks shove wider, big stacks bully — adjust for the tournament stage

**COMPACT REPLIES:**
- Table talk and chat: 1-3 complete sentences, natural-sounding, no filler.`;
}

/** Chat compaction: fold un-summarized table talk into a durable memory entry. */
export function buildChatCompactionPrompt(game: Game, bot: Bot, chat: GameMessage[]): string {
  return `You are updating your private memory between hands. Below is the table talk since your last notes. Compact it: what was said that matters, who is friendly with whom, who is needling whom, what people claimed about their hands.

## Table talk to absorb
${chatLines(chat) || '(nothing new)'}

## Current standings
${standingsSection(game)}

Respond via the schema:
- "summary": a compact paragraph you'd want to remember at hand #${game.handNumber + 1}. Written to yourself, in your own voice.
- "playerReads": one entry per OTHER player still in the game — their style, tells, bluff history, and how they treat you. Keep each read to 1-2 sentences.`;
}

/** Context compaction: S1..Sn have grown too large — collapse them into one entry. */
export function buildContextCompactionPrompt(bot: Bot): string {
  return `Your accumulated memory notes have grown too long. Merge them into ONE compact entry, keeping every read that still matters and dropping what's stale.

## Your notes
${bot.summaries.map((s, i) => `### Memory ${i + 1}\n${s}`).join('\n')}

Respond via the schema: "summary" is the merged note, "playerReads" the surviving per-player reads.`;
}
