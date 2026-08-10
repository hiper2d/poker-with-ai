# Parlor — building with this kit

Dark-only casino aesthetic ("Parlor"): deep green-black surfaces, antique gold accents, parchment card faces. No provider or wrapper is needed — import components and go. Give every page root `class="bg-page"` (the radial green-black backdrop) or `bg-ink`; without it content floats on white and the design is broken.

## Typography
Two families, loaded via Google Fonts from `styles.css` automatically:
- `font-serif` (Instrument Serif) — headings, character names, and ALL numerals (chips, pots, stacks; always pair with `tabular-nums`).
- `font-sans` (DM Sans) — body, buttons, labels. Default.
- Section markers use the `label-caps` class (11px uppercase olive, 0.2em tracking) or the `CapsLabel` component.

## Styling idiom: Tailwind utilities over Parlor tokens
Style layout glue with Tailwind classes using these theme tokens (defined in `styles.css` `@theme`):
- Surfaces: `bg-ink` (page), `bg-panel`, `bg-panel-deep`, `bg-panel-dark`
- Borders: `border-line` (default), `border-line-soft` (row dividers), `border-line-strong` (inputs)
- Gold: `text-gold`, `text-gold-pale` (emphasis), `text-parchment` (big serif numerals), `bg-gold`
- Text: `text-cream` (headings), `text-body`, `text-sage` / `text-sage-dim` (muted), `text-olive` (labels)
- Signals: `text-win` (green), `text-loss` (red); felt/wood tokens `felt`, `felt-hi`, `felt-lo`, `wood`, `moss`, `moss-line`
- Radii: cards/panels `rounded-2xl`, buttons `rounded-xl`, pills `rounded-full`

Ready-made classes (use the matching component instead when one exists): `btn-gold`, `btn-moss`, `btn-dark`, `pill` + `pill-on`, `card-face`, `card-back`, `table-felt`, `seat-pill` + `seat-pill-active`, `label-caps`, `bg-page`, `msg-in` (message entrance animation).

Caveat: the shipped stylesheet is compiled — only utilities already used by the app exist. Prefer the tokens and classes named above; don't invent arbitrary values.

## Where the truth lives
Read `styles.css` (imports `_ds_bundle.css`, which holds the `@theme` tokens and all Parlor classes) before styling anything custom.

## Idiomatic snippet
```jsx
<div className="bg-page min-h-screen p-8">
  <Panel variant="glow" className="p-5" style={{ maxWidth: 420 }}>
    <CapsLabel className="mb-2">Buy-in</CapsLabel>
    <div className="font-serif text-3xl text-parchment tabular-nums">1,000</div>
    <div className="text-sm text-sage">200 big blinds at 2/5</div>
    <Button variant="gold" size="lg" className="mt-4">Join the hand</Button>
  </Panel>
</div>
```
Components: `Avatar`, `Button`, `CapsLabel`, `ChatBubble`, `Panel`, `Pill`, `PlayingCard`, `SeatPill`, `TableFelt`. `PlayingCard` takes `card="Ah"` codes (`T`=10, suits `h d c s`) or `card="back"`; `SeatPill` shrinks to content — position it absolutely over `TableFelt`.
