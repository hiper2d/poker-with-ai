# Poker with AI — development roadmap

Status: playable end-to-end (sit-n-go vs bots, betting, chat, six UI themes).
What follows is ordered roughly by value.

## 1. Game intelligence

- [x] **Inject game history into bot decisions** (done): decision prompts now carry
      tournament standings + recent `handHistory` records (last 2 with full action
      lines); `bot.summaries` ride in the system prompt as "your memory"; chat below the
      bot's `chatWatermark` is excluded (it lives in the summaries).
- [x] **Compaction system** (done): `COMPACT_CHAT` every `compactionIntervalHands`
      hands (skipped when <`chatCompactionMinTokens` of new talk, forced off-interval
      past `chatCompactionTokenThreshold`), `COMPACT_CONTEXT` when summaries outgrow
      `contextCompactionTokenThreshold`. Runs as game-queue events in the COMPACTION
      state between hands; COMPACTION messages show in the events feed; scheduling
      logic is pure (`lib/game/compaction.ts`) and tested. Summaries are stripped from
      the client payload (private reads).
- [ ] **Port the GM chat router** from werewolf (`bot-selection.ts`): LLM picks responders
      with quiet-bot pressure + hidden reasoning message. Currently mention-detection +
      random 1-2 (marked TODO in `sendChatMessage`).
- [ ] **Retry with a different model** when a bot call fails mid-hand (werewolf's one-shot
      `modelOverride` pattern) instead of a plain Retry of the same model.

## 2. Money & models

- [ ] **Cost tracking port**: per-call Firestore transaction (user spendings,
      `poker_requestStats` doc, per-bot accumulated usage), `cost` on messages, cost badges
      in UI. Pricing table now covers all 10 models (ported from werewolf's verified
      numbers) — extended-context/peak-hour surcharges still unmodeled.
- [x] **Tier enforcement** (done): free/api/paid tiers with werewolf's price-banded
      free-tier policy (`config/tiers.ts`), tier-aware key routing via shared
      `config/freeTierApiKeys` (`lib/api-keys.ts`), picker + server-side validation
      (`lib/model-access.ts` + tests), tier cards on the profile page. Paid tier switch
      is blocked until the balance flow (Stripe) exists.
- [ ] **Paid tier balance flow**: Stripe top-up + per-call deduction with the 30% markup
      (`PAID_TIER_MARKUP`); unblock the Paid card in `ProfileTierCards`.
- [ ] **Mistral agent** (own SDK; only unported provider — keys already in .env).

## 3. Engine correctness

- [ ] Dead blinds / button rule after eliminations (TODO in `startHand`; currently naive
      rotation).
- [ ] More engine tests: multi-way side pots at showdown, short all-in reopen edge cases,
      heads-up transition when the table shrinks to 2.
- [ ] Sanity: cap raise slider / coercion against table stakes (already clamped — add tests).

## 4. UX polish

- [ ] **Mobile game room**: the design's bottom-sheet chat + fixed action bar
      (`Poker Parlor.dc.html` has the spec; current layout is desktop-first).
- [ ] **Showdown reveal**: show bots' hole cards on the felt at showdown (data is in
      HAND_RESULT/handHistory; render card faces at the seats briefly).
- [ ] Elimination + game-over moments (toast/banner when a character busts).
- [ ] Optional: restore per-character avatar colors as a parlor-theme accent.
- [ ] Optional: TTS voices per character (werewolf parity; voice configs exist there).

## 5. Infra / housekeeping

- [ ] **Commit the repo** — everything since the scaffold is uncommitted; set up remote.
- [ ] **Re-sync the UI kit to Claude Design before the next design session** — components
      + stylesheet changed (themes); also rewrite `.design-sync/conventions.md` for the
      semantic token vocabulary (`--t-*`, `r-md`/`r-sm`, theming rules).
- [ ] TTL policy on `poker_games.expireAt` (one-time, Firebase console/gcloud).
- [ ] BetterStack: fill `LOGTAIL_SOURCE_TOKEN`/host in `.env` (sink code is ready).
- [ ] Production deploy prep: own OAuth apps (werewolf's are shared, callback URLs),
      env strategy, and revisit `firestore.rules` assumptions.

## Reference

- Architecture: `DESIGN.md`. Sync notes/risks: `.design-sync/NOTES.md`.
- Claude Design projects: kit `5b5c24eb-c345-4c1b-80da-1fe29b448570` (components + game
  templates), original screens `da9e8511-cd21-487c-beb9-f8e1bc8c5d3b`.
- Werewolf reference paths: see the table at the bottom of the architecture summary in
  `../werewolf-ai-party-game/werewolf-client/` (bot-selection.ts, cost-tracking.ts,
  night-actions.ts summarization, mistral-agent.ts).
