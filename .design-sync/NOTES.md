# design-sync notes — poker-with-ai

- This is an app repo, not a component package: no dist build. The bundle entry is the
  source barrel, passed explicitly: `--entry ./components/ui/index.ts`. Auto-discovery
  finds zero components (the only repo `.d.ts` is `types/pokersolver.d.ts`) — the 9
  components are pinned in `cfg.componentSrcMap`; add new components there.
- The stylesheet is generated in two steps before the converter runs:
  1. `cfg.buildCmd` (tailwind CLI) compiles `app/globals.css` → `.design-sync/dist/tailwind-out.css`
  2. `.design-sync/dist/parlor.css` = a small header (Google Fonts `@import` for DM Sans /
     Instrument Serif + `:root` defs for `--font-dm-sans`/`--font-instrument-serif`, which
     next/font provides in the app but nothing provides in Claude Design) + the tailwind output.
  Re-run BOTH steps when `globals.css` or component classes change — the compiled CSS only
  contains utilities actually used in the app at compile time.
- Render check runs against system Chrome via
  `DS_CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"` —
  no playwright browser download (user preference).
- `SeatPill` previews need `width: fit-content` wrappers — in the app the pill is
  absolutely positioned over the felt and shrinks to content; unwrapped in a card grid it
  stretches full-width.
- `TableFelt` has `cardMode: column` (wide component).
- Known render warns: none.

## Re-sync risks

- `parlor.css` assembly is manual (two-step above) — a re-sync that skips step 2 ships a
  stylesheet without fonts, and every card silently falls back to system fonts.
- The compiled stylesheet is usage-scoped: a new component using Tailwind utilities not yet
  used anywhere in the app renders unstyled until the tailwind recompile runs.
- Fonts load from Google Fonts at runtime (`[FONT_REMOTE]`-style) — offline preview
  environments render fallback serif/sans.
- Model display names inlined in previews ("Claude Sonnet", "DeepSeek V4 Pro", …) can
  drift from `config/models.ts` — cosmetic only.
- The werewolf repo's design project ("Poker AI website design",
  `da9e8511-cd21-487c-beb9-f8e1bc8c5d3b`) is the visual source of truth for the Parlor
  language; `app/globals.css` encodes it.
