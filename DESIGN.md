# Poker with AI — Design

A poker table where AI bots with generated characters play No-Limit Hold'em against the human
and each other, and talk at the table. Spiritual clone of the Werewolf AI Party Game
(`../werewolf-ai-party-game`), with the game loop inverted: a deterministic poker engine owns
the flow; LLMs only decide actions and chat.

## Core principles

1. **Deterministic engine, LLM at the edges.** Shuffling, dealing, betting legality, pot math,
   side pots, and hand evaluation are pure TypeScript (`lib/engine/`), fully unit-testable,
   zero LLM involvement. LLMs do exactly two things: decide a betting action (structured output)
   and talk (free text).
2. **Chat is independent of the game.** Two parallel queues, both driven from the UI like in
   werewolf, each with its own client-side pump and mutex:
   - `gameQueue: GameEvent[]` — owned by the engine/state machine.
   - `chatQueue: ChatEvent[]` — fed by the GM router (when the human speaks), manual selection,
     or mentions. Chat replies never touch game state, so the pumps run concurrently.
3. **Typed queue events.** Queue entries are `{ actor, kind, ... }` objects, never bare names.
   The event carries its meaning; the state does not.
4. **Config as data.** State transitions (`config/state-graph.ts`), table rules
   (`config/game.ts`), model catalog (`config/models.ts`), pricing (`config/pricing.ts`), and
   personas (`config/personas.ts`) are separate, logic-free config modules.
5. **Cross-cutting concerns live once.** Server actions are composed through `gameAction()`
   (auth → load game → state guard → run → persist → error capture → log). No action re-checks
   auth or wraps its own try/catch.
6. **Pluggable logging.** `LogSink` interface, fan-out `Logger`, sinks for console and
   BetterStack; more can be added without touching call sites.

## Bot context model

Each bot's LLM context is a strict layered structure:

```
[ static system prompt: persona, story, table rules ]   never changes
[ precise game records: hand history, eliminations ]    engine-written, never summarized
[ summaries: S1, S2, ... Sn ]                           appended by compaction
[ raw chat since the bot's chat watermark ]
[ current hand: hole cards, board, action log, stacks ] always verbatim
```

Two compaction processes, same machinery, both scheduled as events in the **main** queue
(so the UI shows "X is compacting memory…"), and only ever between hands:

- **Chat compaction** — every `compactionIntervalHands` hands: the bot summarizes raw chat into
  one entry (narrative summary + analysis/reads of every player at the table), appends S(n+1),
  and advances its chat watermark (a message-counter bound; nothing is deleted from Firestore).
- **Context compaction** — when `tokens(system + summaries)` crosses a threshold: summarize
  S1..Sn into a single S′. Same summarize call, different input. Recursive by construction.

## Turn shape

When the engine says it's a bot's turn, one structured call returns:

```
{ action: fold | check | call | bet | raise, amount?, reasoning, tableTalk? }
```

`tableTalk` is an optional table comment that lands in chat as a normal message (it bypasses
the chat queue — it is part of the action result). Chat is visible in every bot's context, so
needling and bluff-talk can genuinely influence decisions.

## State machine

States are data in `config/state-graph.ts`; handlers are classes implementing `StateHandler`,
resolved via a registry (same shape as werewolf's role-processor factory). Betting order is
computed by the engine after every action (a raise reopens action) — the game queue holds only
the next certain event plus scheduled ones.

```
WELCOME → HAND_SETUP → BETTING(preflop→flop→turn→river) → SHOWDOWN → HAND_RESULTS
   → [COMPACTION] → HAND_SETUP … → GAME_OVER
```

Format: No-Limit Hold'em sit-n-go (equal stacks, rising blinds, eliminations, last standing
wins). The engine is format-agnostic; cash games can slot in later.

## Infrastructure (cloned from werewolf)

- **Firebase**: Firestore via Admin SDK, server-side only. **Shares the werewolf project**
  (project-limit constraint). Only `config` is shared between the two games; all other
  poker collections carry the `poker_` prefix: `poker_games/{id}` (+ `messages`
  subcollection, `{counter-author-recipient}` ids), `poker_users/{email}`,
  `poker_requestStats`. Users therefore enter their API keys once per game app.
  Sliding TTL on `expireAt` — the TTL policy for `poker_games` must be created once
  (console/gcloud); werewolf's policy only covers its own collection. Caution:
  `firebase deploy --only firestore:indexes` from either repo deletes the other's
  composite indexes — keep one canonical indexes file.
- **Auth**: NextAuth v5, GitHub + Google; session email is the user key.
- **AI layer**: `AbstractAgent` (askText / askWithZodSchema template methods, token usage,
  thinking support), `AgentFactory` per vendor, user-owned API keys per tier.
- **Tiers**: code wired from day one (free / api / paid), launching API-tier only.
  Stripe + platform keys deferred.
- **Cost tracking**: per-call transaction — balance, spendings, bot/game usage, requestStats.
- **No realtime**: client pumps drain queues one server-action call at a time
  (in-flight ref per pump), errors persist to `game.errorState` with retry UI.

## Setup flow

Same as werewolf: preview (one GM structured call → scene "why these characters sat down at
this table, what's at stake" + per-player { name, gender, story, persona, voice }) → editable
preview UI → create game (deal models from the user's selected deck, write game doc).
Personas come from `config/personas.ts` (tight-aggressive shark, loose maniac, rock, …).

## Directory map

```
app/                  routes (App Router) + server actions under app/api/
config/               state-graph, game, models, pricing, personas
lib/engine/           pure poker engine (no Firestore, no LLM)
lib/state-machine/    event/handler types + registry
lib/ai/               agent abstraction + vendor agents
lib/logging/          LogSink abstraction + sinks
lib/actions/          gameAction composition wrapper
lib/firebase/         admin SDK init
models/               domain types (Game, Seat, Bot, GameMessage, queues)
```
