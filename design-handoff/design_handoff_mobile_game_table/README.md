# Handoff: Mobile Game Table (Poker with AI)

## Overview
A phone-optimized version of the "Poker with AI" live game table. The desktop table
(three stacked chrome rows: global nav, table-state row, last-event banner) did not fit a
phone: text was cropped and the felt/seats overflowed the viewport. This design collapses
in-game chrome to **one top bar**, sizes the felt and seat ring from the viewport, moves the
hand/action panel to the **side on wide screens and the bottom on tall screens**, and never
shows chat and the action panel at once when there is not enough room.

Target: any phone, **portrait and landscape**. Verified at 390x844 and 844x390 (and 924x540)
with zero out-of-viewport elements and no document scroll.

## About the Design Files
The file in this bundle is a **design reference written in HTML** — a working prototype of the
intended look and behavior, not production code to copy. The task is to **recreate this design
in the target codebase** (the real Poker with AI React app) using its existing components,
styles and state, not to ship this HTML. It is built on the project's own `poker-with-ai`
component library (`PokerUI`: Avatar, Button, CapsLabel, ChatBubble, Panel, Pill, PlayingCard,
SeatPill, TableFelt) plus its compiled stylesheet, so most visuals map 1:1 to existing
components; the new work is layout, chrome collapsing and the two new dialogs.

## Fidelity
**High-fidelity.** Final colors, type, spacing, sizes and interactions. Recreate pixel-accurately
using the existing library. Everything here is measured from the prototype.

## Screens / Views

### 1. Table — portrait (tall screens, vh >= vw)
Purpose: watch the hand, read the last event and chatter, act on your turn.

Vertical stack (fixed, `position: fixed; inset: 0`, no page scroll):
1. **Top bar** (flex row, gap 8, padding `max(8px, env(safe-area-inset-top)) 12px 9px`,
   border-bottom `1px solid #232b1e`, background `linear-gradient(90deg, rgba(31,59,46,.35), rgba(20,24,15,0))`)
   - **Menu button** 44x44, radius 13, border `1px solid #2a3325`, background `rgba(216,178,90,.08)`,
     three 14x1.5px bars `#ecd39a`, gap 3. Opens the menu sheet.
   - **State chip** (button): min-height 44, padding `0 14px`, radius 999,
     border `1px solid #2a3325` (`#d8b25a` when open), background `rgba(12,16,11,.6)`
     (`rgba(216,178,90,.14)` when open). Contents: 6px gold dot (`#d8b25a`,
     `box-shadow: 0 0 8px 2px rgba(216,178,90,.45)`), stage label 10px/.14em uppercase `#d8b25a`,
     hand number 10px/.1em uppercase `#7d8b6a`. Opens the game-state dialog.
   - **Last event** (flex 1, min-width 0): Instrument Serif 17px/1.1 `#ece5d3`, single line,
     `text-overflow: ellipsis`. The whole bar flashes on each new event
     (`translateY(5px)` + opacity .4 -> 0, 360ms `cubic-bezier(.2,.8,.3,1)`).
     Timestamp (9px/.08em `#7d8b6a`, tabular) is **hidden in portrait**, shown in landscape.
   - **Play/pause** 44x44 circle, border `1px solid #2a3325`, background `rgba(216,178,90,.1)`,
     glyph `❙❙` / `▶` 12px `#ecd39a`.
   - **Talk** 44x44 circle, 16px stroked speech-bubble icon (`stroke-width 1.3`, currentColor),
     idle `#94a68f` + border `#2a3325`; open `#ecd39a` + border `#d8b25a` + background `rgba(216,178,90,.14)`.
     Unread badge: 7px `#d8b25a` dot at top 8 / right 8 with `0 0 8px 2px rgba(216,178,90,.5)`.
2. **Table area** (flex 1, centered). See "Table geometry".
3. **Table-talk preview** (portrait only, height 152, padding `0 12px`, tappable -> opens sheet):
   header row = "TABLE TALK" 9px/.18em uppercase `#7d8b6a`, 1px `#1b2117` rule, "TAP TO OPEN"
   9px/.1em `#5f6d52`; below it the **last 3** chat messages as `ChatBubble`s, gap 7, bottom-aligned, clipped.
4. **Action panel** (bottom): border-top `1px solid #1b2117`, padding
   `4px 12px max(12px, env(safe-area-inset-bottom))`, gap 10, column.
   - Hand row (row, gap 10, centered): "YOUR HAND" 9px/.18em uppercase `#7d8b6a`;
     two `PlayingCard`s scaled 0.92 (gap 5, `transform-origin: left center`); spacer;
     right-aligned "STACK" label + Instrument Serif 17px/1.1 `#efe2c0` tabular value.
   - Button row (row, gap 8): Fold / Call 900 / Raise 2,700, each `w-full` and equal width,
     min-height 52, `px-4`, `text-sm` — DS `btn-dark`, `btn-moss`, `btn-gold`.

### 2. Table — landscape (wide screens, vw > vh)
Same bar (plus the event timestamp). Main becomes a **row**: table area (flex 1) + **action rail**
on the right, width 168, border-left `1px solid #1b2117`, padding-left 14, vertically centered.
In the rail the hand row becomes a **column** (gap 6, left-aligned) and the three buttons stack
(column, gap 8, full width). The chat preview strip is hidden.

### 3. Table talk (sheet)
- Portrait: bottom sheet, `left 0; right 0; bottom 0; top 32%`, radius `18px 18px 0 0`,
  background `rgba(10,13,9,.97)`, `backdrop-filter: blur(8px)`, border `1px solid #232b1e`,
  behind it a scrim `rgba(4,6,4,.6)` that closes on tap. **Pinned by insets, never by height** —
  and it only fades in (`opacity 0->1`, 220ms ease-out); no transform entrance (a re-applied
  translate animation once pushed the input row off-screen).
- Landscape: right panel, width 330, full height, no scrim; **the action rail is hidden**
  (`display: none`) and main gets `padding-right: 344` so the felt re-measures into the
  remaining width — one panel at a time.
- Header: "TABLE TALK" 10px/.2em uppercase `#7d8b6a`; "Events {n}" toggle (min-height 44,
  padding `0 14px`, radius 999; on = border `#d8b25a`, background `rgba(216,178,90,.14)`, text `#ecd39a`;
  off = border `#2a3325`, text `#7d8b6a`) filters event rows in or out of the feed; "Close" (same metrics, `#94a68f`).
- Feed: scrollable, padding `0 14px 10px`, gap 8. Messages = `ChatBubble` (author, authorColor,
  `mine`, `system: 'plain' | 'highlight'`). Event rows = 9px tabular time `#4d5a41` + 11px/.02em text,
  colors by kind: win `#d6bd85`, stage `#a08a53`, fold `#6d6055`, else `#8d9a80`; newest opacity .95,
  older .55; enter with `rowIn` (translateY(-4px) -> 0, 300ms).
- Composer: border-top `1px solid #1b2117`, padding `10px 14px` with
  `padding-bottom: max(10px, env(safe-area-inset-bottom))`; input min-height 44, padding `11px 16px`,
  radius 999, background `rgba(12,16,11,.9)`, border `1px solid #2a3325` (focus `#d8b25a`), 14px `#e8f0dd`;
  send button 44x44 circle, border `1px solid #3f4a35`, background `rgba(216,178,90,.14)`, `›` 17px `#ecd39a`.
  Enter or tap sends. Feed auto-scrolls to the newest message.

### 4. Menu sheet (replaces the global nav in-game)
Anchored top-left: `top: max(10px, env(safe-area-inset-top)); left: 12`, width `min(300, vw - 24)`,
max-height `vh - 40`, scrollable, radius 18, border `1px solid #2a3325`, background `rgba(10,13,9,.98)`,
shadow `0 30px 60px -20px rgba(0,0,0,.9)`, fade-in 200ms; scrim `rgba(4,6,4,.6)`.
- Header: "Parlor" Instrument Serif 20px `#ece5d3` + tier badge ("PAID") 9px/.16em uppercase
  `#241a08` on `#d8b25a`, radius 999, padding `3px 9px`.
- Rows (Instrument Serif 19px, min-height 48, padding `12px 4px`, 1px `#1b2117` top rule from the
  second row on): Tables, Host a table, Models, Rules, Profile, and **Leave table** in `#8a6f66`.
- Theme row: "THEME" 10px/.18em uppercase `#7d8b6a` + three DS `pill` buttons
  (Parlor / Pixel / Sumi), min-height 44, padding `0 16px`, selected gets `pill-on`.
- "BACK TO TABLE" button: full width, min-height 48, radius 999, border `1px solid #2a3325`,
  11px/.14em uppercase `#94a68f`.
Rationale: in-game there is no logo, no avatar, no logout and no nav — they live here.

### 5. Game-state dialog (replaces the table-state row)
Centered, `translate(-50%,-50%)`, width `min(400, vw - 24)`, max-height `vh - 28`, scrollable,
radius 18, border `1px solid #3a4430`, background `rgba(10,13,9,.98)`, same shadow and fade.
- Title "Hand #41" Instrument Serif 22px `#ece5d3`, `white-space: nowrap`; stage 10px/.18em uppercase `#d8b25a` right.
- 3-column grid (gap 10, padding `12px 0 4px`): Pot / Blinds / To call — 9px/.18em uppercase
  `#7d8b6a` labels over Instrument Serif 20px/1.2 `#efe2c0` tabular values.
- Roster (top rule `1px #1b2117`, gap 7), one row per seat: status dot 7px (acting `#d8b25a`,
  folded `#3f4a35`, else the seat's avatar color), name Instrument Serif 16px `#ece5d3`,
  model tag 10px `#7d8b6a` (ellipsis; "you" for the human), last action 9px/.14em uppercase
  (`#7fbf6a`, folded `#8a6f66`), stack 13px `#d8b25a` tabular. Folded rows at opacity .45.
- "CLOSE" button: full width, min-height 48, same as "Back to table".

## Table geometry (the core of the mobile fix)
`TableFelt` is locked to `aspect-ratio: 1.62` by the design system, so **the positioning box must
match the felt exactly** or the seat ring floats away from the rim.

```
FELT_R   = 1.62            // .table-felt aspect-ratio
OVER_TOP = 0.20            // ring overhang above the felt, fraction of felt height
OVER_BOT = 0.08            // ring overhang below
PILL_PAD = 30              // fixed allowance for half a seat pill, px

w = areaWidth - 16
h = areaHeight
hFit = max(110, (h - 2 * PILL_PAD) / (1 + OVER_TOP + OVER_BOT))
tableW = round(min(w, hFit * FELT_R))
tableH = round(tableW / FELT_R)
box.marginTop = round(tableH * (OVER_TOP - OVER_BOT) / 2)   // clears the top bar
```
Recompute on `ResizeObserver` of the table area, on `resize`, on `orientationchange`, and
whenever the talk sheet opens or closes.

**Seat ring** (percent of the box; `a` = anchor: `c` centred on the point, `l` extends right,
`r` extends left — so the two side seats stay inside the viewport):
```
portrait : (50,104,c) (1,64,l) (15,-8,c) (50,-16,c) (85,-8,c) (99,64,r)
landscape: (50,104,c) (1,52,l) (20,-8,c) (50,-16,c) (80,-8,c) (99,52,r)
```
Transform: `translate(<0 | -50% | -100%>, -50%) scale(k)`, `transform-origin` left/center/right to
match the anchor, where `k = clamp(0.52, tableW / 620, 0.92)`. Model tags are **off by default** on
phones (`seatTags`) so pills stay narrow; they are visible in the state dialog instead.
Acting seat: ring `inset -6px`, radius 999, border `1px solid rgba(216,178,90,.55)`,
`box-shadow: 0 0 18px 3px rgba(216,178,90,.22)`, `seatPulse` 1.6s ease-in-out infinite.

**Pot / board inside the felt**: "POT" 9px/.24em uppercase `#a9c0ac`; value Instrument Serif
`clamp(26, tableW / 8, 44)`px `#efe2c0` tabular; board row gap 6 scaled by
`clamp(0.6, (tableW - 40) / 320, 1)`.

**Bet chips**: pill at `left = pos.left + (50 - pos.left) * 0.6`, `top = pos.top + (50 - pos.top) * 0.5`
(percent of the box), background `rgba(8,12,8,.8)`, border `1px solid rgba(216,178,90,.3)`,
two overlapping 10px gold chips (`radial-gradient(circle at 50% 35%, #e6c477, #b98f3c)`) + 10px
`#ecd39a` tabular amount; enters with `chipPop` (scale .45 -> 1.12 -> 1, 420ms).

**Speech bubbles** live in their own **unscaled** layer over the box (not inside the scaled seat
wrapper, which used to push them off-screen): width `clamp(160, tableW * 0.62, 232)`,
`left = clamp(2, seatCenterX - w/2, tableW - w - 2)`, below the pill for top seats
(`top = cy + pillH/2 + 6`), above it otherwise (`translateY(-100%)`); `bubblePop` 280ms; auto-dismiss 4600ms.

## Interactions & Behavior
- Menu / state dialog / talk are **mutually exclusive**; opening one closes the others.
  Scrim tap and the explicit Close/Back buttons dismiss.
- Landscape + talk open -> action rail hidden, felt re-measured; portrait keeps the action panel
  under the sheet.
- Play/pause drives the scripted hand loop (default 2400ms per step, tweakable 1200-4000).
- Hero actions (Fold / Call 900 / Raise 2,700) update pot, stack, seat state and push an event.
- Chip flight: 3 chips per bet from seat -> its stack position, 440ms
  `cubic-bezier(.25,.9,.3,1)` staggered 80ms, plus a rising `+amount` badge (600ms) coloured
  bet/raise `#d8b25a`, call `#7fbf6a`, check `#94a68f`, fold `#8a6f66`.
- Street change / showdown sweeps every bet to the pot (460ms) then pulses the pot value
  (scale 1.16, colour `#ffe9b0`, 520ms).
- Unread dot appears on the Talk button for messages received while the sheet is closed.
- **All controls are >= 44px tappable**: bar buttons 44x44, state chip 44 tall, sheet header
  buttons 44, menu rows 48, theme pills 44, action buttons 52.

## State Management
```
idx, handNo, stage, board[], pot          // hand progression
seats[] { name, tag, color, stack, bet, lastAction, folded, dimmed, active, dealer, msg, isHuman }
feed[]  { kind: 'msg' | 'event', ... }    // chat + event log, capped at 60
log[], unread, draft, logExpanded
vw, vh, tableW, tableH                    // viewport + derived geometry
running, logOpen, menuOpen, stateOpen, theme
```
Tweakable props in the prototype: `autoplay`, `taunts`, `speed` (ms), `seatTags`, `logOpen`.
In the real app the hand progression and chatter come from the server; keep the geometry state
(`vw/vh/tableW/tableH`) local and derived.

## Design Tokens
All from the existing `poker-with-ai` stylesheet — prefer the tokens/classes over these literals.
- Surfaces: page `#0a0d09`, panels `rgba(10,13,9,.97-.98)`, inset `rgba(12,16,11,.6-.9)`, scrim `rgba(4,6,4,.6)`
- Lines: `#1b2117` (soft), `#232b1e`, `#2a3325`, `#3a4430`, `#3f4a35`
- Gold: `#d8b25a`, pale `#ecd39a`, parchment `#efe2c0`, on-gold text `#241a08`
- Text: cream `#ece5d3`, body `#cfd8c4`, `#e8f0dd`, sage `#94a68f`, olive `#7d8b6a`, dim `#5f6d52` / `#4d5a41`
- Signals: win `#7fbf6a` / `#d6bd85`, stage `#a08a53`, loss / folded `#8a6f66`, felt text `#a9c0ac`
- Type: Instrument Serif (headings, names, all numerals + `tabular-nums`), DM Sans (everything else).
  Sizes used: 9, 10, 11, 13, 14, 15, 16, 17, 19, 20, 22, and the pot at 26-44.
- Radii: 999 pills, 18 sheets/dialogs, 13 menu button, 12 chips, DS `rounded-2xl` panels
- Spacing: 4 / 6 / 7 / 8 / 10 / 12 / 14 / 16, safe-area insets on the top bar and composer
- Motion: `bubblePop` 280ms, `chipPop` 420ms, `rowIn` 300ms, `seatPulse` 1.6s, `sheetFade` 220ms,
  chip flight 440ms, sweep 460ms, pot pulse 520ms
- Shadows: sheets `0 30px 60px -20px rgba(0,0,0,.9)`, chips `0 6px 14px -6px rgba(0,0,0,.9)`

## Assets
None. Icons are inline: the menu glyph is three divs, the chat glyph a 16x16 stroked SVG path,
the send affordance the character `›`. Cards, avatars and the felt all come from `PokerUI`
components. No images, no icon font, no emoji.

## Implementation notes for the real app
- Keep using `PokerUI` components; the prototype only adds layout and the two dialogs.
- `PokerUI.Button` and `PokerUI.Pill` append `className` — pass DS classes plus size utilities
  (e.g. `btn-gold min-h-[52px] px-4 text-sm w-full`, `pill min-h-11 px-4`) rather than replacing them.
  Only utilities already used by the app exist in the compiled CSS.
- Do not give an entrance animation any role in a sheet's resting position; pin sheets with insets.
- Re-measure the table on orientation change and whenever a panel opens or closes.

## Files
- `Mobile Game Table.dc.html` — the full prototype (markup + logic in one file). Portrait is the
  default preview size (390x844); resize the window to see the landscape layout.
