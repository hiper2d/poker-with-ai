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
- [x] **Chat router — the Pit Boss** (done): LLM picks who speaks next, on the GM model,
      with quiet-bot pressure (activity derived from the message log, no stored counter)
      and a `GM_ROUTER_SELECTION` trace message in the events feed. Four triggers: human
      message, "Nudge table", manual mic-pass to one character, and a bot's own table talk
      (`shouldRouteReaction` gates that one to a quiet table with budget left; picking
      nobody is the expected answer). Model answers are clamped against the live table
      (`clampSpeakers`). Bot chat replies are capped per hand and per game
      (`GAME_CONFIG.chatBudget`, tighter on the free tier); at zero the router isn't
      called either. All rules are pure + tested in `lib/game/chat-router.ts`; the call
      lives in `lib/ai/pit-boss.ts`.
- [x] **Per-lane failure + retry** (done, werewolf's flow): identical to werewolf except
      that the two independent loops get their own error slots — `gameError`/`chatError`
      plus `gameRetry`/`chatRetry` on the game doc, accessors in `lib/game/retry.ts`.
      Every model call is tagged with `AiCallError` (`lib/ai/errors.ts`); a failure records
      who/which model/why and **stops that lane** (the pump no-ops server-side, so a stray
      tick or second tab can't re-fire it) with no fallback anywhere. As in werewolf,
      clearing the error IS the retry: `retryLane` swaps it for a one-shot `RetryPlan` and
      the pump re-runs whatever step is still pending — the queue head is untouched, so the
      bot that failed speaks again. The plan carries the failure hint (appended to the
      prompt via `retryNote`) and optionally a tier-validated one-shot model. Pure parts
      tested in `lib/game/retry.test.ts`.

## 2. Money & models

- [x] **Cost tracking port** (done): every AI call commits one Firestore transaction —
      user charge + monthly spendings + game totals (`totalGameCost`, per-bot/GM
      `tokenUsage`) + a `poker_requestStats` doc (`lib/cost-tracking.ts`); billing keys
      off the user's CURRENT tier read in-transaction. Preview (story-gen) charges
      standalone in `game-actions.ts`. Extended-context/peak-hour surcharges still
      unmodeled.
- [x] **Tier enforcement** (done, reworked to werewolf's two-tier model): the BYO-keys
      'api' tier is retired — everyone plays on platform keys (`config/freeTierApiKeys`).
      free = price-banded subset + per-game caps + 5 games/day; paid = full catalog,
      cost + 30% (`PAID_TIER_MARKUP`) from a prepaid balance, gated on balance > 0 at
      game creation. `gameAction` enforces ownership + tier match (a table plays under
      the tier it was created with). Legacy 'api' docs coerce to free and are cleaned on
      sign-in.
- [x] **Paid tier balance flow** (mostly done): per-call deduction with markup,
      `addBalance` with free→paid auto-upgrade, top-up UI, `/models` catalog page —
      live. Remaining:
      - [x] **Wire Stripe** (code done): real checkout + webhook with signature verify,
            `poker_stripeEvents` idempotency, and the shared-account `metadata.app`
            guard (mirror guard added to werewolf's checkout + webhook — commit/deploy
            werewolf BEFORE taking a real poker payment, or top-ups double-credit).
            - [x] Fill env vars (done, TEST mode): prod env set on Vercel, webhook
                  endpoint registered for pokerwithai.net. Remaining: test-mode
                  end-to-end run (card 4242…), then the live-mode switch (live
                  products/prices + live key + live webhook — and deploy werewolf's
                  `metadata.app` guard FIRST, see above).
- [x] Cost badges in UI (mostly done): seat dialog shows per-bot spend, game dialog
      (click the theme name) shows total + Pit Boss spend; both allow a permanent
      tier-validated model switch (`changeBotModel`/`changeGmModel`). Open: per-message
      cost badges in the chat feed.
- [ ] Verify the first live billed hand: balance decrement, `poker_requestStats` docs,
      game totals accumulating.
- [ ] Record FAILED AI calls in `poker_requestStats` (`status: 'error'` + message) —
      today only successes are written, so a failed call leaves no queryable trace
      once its lane error is cleared by a retry.
- [ ] **Mistral agent** (own SDK; only unported provider — keys already in .env).

## 3. Engine correctness

- [ ] Dead blinds / button rule after eliminations (TODO in `startHand`; currently naive
      rotation).
- [ ] More engine tests: multi-way side pots at showdown, short all-in reopen edge cases,
      heads-up transition when the table shrinks to 2.
- [ ] Sanity: cap raise slider / coercion against table stakes (already clamped — add tests).

## 4. UX polish

- [x] **Mobile game room** (portrait — done): fixed-position screen (no page scroll),
      clamped seats, portrait felt, one-line header, draggable clamped speech bubbles,
      compaction progress in the top bar, events shown in chat by default. Dev preview
      + measurement harness: `/dev/table` (dev-only) + `scripts/measure-layout.js`.
- [ ] **Landscape mobile** is currently unusable — needs its own layout pass
      (short-viewport arrangement, or a "rotate your phone" interstitial as a stopgap).
- [ ] **More storytelling**: richer GM narrative beats during play (scene-setting
      between hands, stakes rising with the blinds — the GM model is already wired).
- [ ] **Eliminated players go silent**: busted characters drop out of table talk
      (`liveBots`) — let them keep needling from the rail after losing their stack.
- [ ] (?) A button to hide the chat completely — undecided; the rail already collapses,
      this would suppress bubbles + banner too.
- [ ] **Showdown reveal**: show bots' hole cards on the felt at showdown (data is in
      HAND_RESULT/handHistory; render card faces at the seats briefly).
- [ ] Elimination + game-over moments (toast/banner when a character busts).
- [ ] Optional: restore per-character avatar colors as a parlor-theme accent.
- [ ] Optional: TTS voices per character (werewolf parity; voice configs exist there).

## 5. Infra / housekeeping

- [x] **Commit the repo** (done) — pushed to github.com/hiper2d/poker-with-ai with
      README + screenshots; `.env` and local tool state ignored, `.env.example` committed.
- [ ] **Re-sync the UI kit to Claude Design before the next design session** — components
      + stylesheet changed (themes); also rewrite `.design-sync/conventions.md` for the
      semantic token vocabulary (`--t-*`, `r-md`/`r-sm`, theming rules).
- [ ] TTL policy on `poker_games.expireAt` (one-time, Firebase console/gcloud).
- [ ] **Better Stack + monitoring**: fill `LOGTAIL_SOURCE_TOKEN`/host in Vercel prod
      env (sink code is ready). Without it, prod logs die after ~1h (Vercel hobby) —
      already cost us one undiagnosable bot error. Consider an uptime check too.
- [x] Production deploy prep (done): live at https://pokerwithai.net on Vercel — own
      OAuth apps (Google URI added, separate GitHub prod app), prod env vars, Cloudflare
      DNS (grey-cloud), www→apex 308 redirect (theme/localStorage + session are
      per-origin!), OG/Twitter card metadata + `public/og.png`.
- [ ] **SEO**: `llms.txt` for AI search, `robots.txt` + `sitemap.xml`, per-page
      metadata/canonicals for the public pages (rules, models).
- [ ] Parallel or background chat compaction: the between-hands COMPACTION steps run
      sequentially and can hold the next deal for ~a minute on a slow model; the next
      hand doesn't actually need the summaries — only future prompts do.

## Reference

- Architecture: `DESIGN.md`. Sync notes/risks: `.design-sync/NOTES.md`.
- Claude Design projects: kit `5b5c24eb-c345-4c1b-80da-1fe29b448570` (components + game
  templates), original screens `da9e8511-cd21-487c-beb9-f8e1bc8c5d3b`.
- Werewolf reference paths: see the table at the bottom of the architecture summary in
  `../werewolf-ai-party-game/werewolf-client/` (bot-selection.ts, cost-tracking.ts,
  night-actions.ts summarization, mistral-agent.ts).
