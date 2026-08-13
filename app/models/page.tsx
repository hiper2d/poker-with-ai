import type { Metadata } from 'next';
import ModelsCatalog from '@/components/ModelsCatalog';
import { CapsLabel, Panel } from '@/components/ui';
import {
  FREE_TIER_LIMITED_MAX_BOTS,
  FREE_TIER_OUTPUT_PRICE_BANDS,
  FREE_TIER_THINKING_COST_FACTOR,
} from '@/config/tiers';

export const metadata: Metadata = {
  title: 'Models — Poker with AI',
  description:
    'Every model you can seat at the table — what it costs to run and where it is available.',
};

const PRICE_BANDS = [
  { range: `≤ $${FREE_TIER_OUTPUT_PRICE_BANDS.UNLIMITED_MAX}`, cap: 'Unlimited bots / game' },
  { range: `≤ $${FREE_TIER_OUTPUT_PRICE_BANDS.LIMITED_MAX}`, cap: `Up to ${FREE_TIER_LIMITED_MAX_BOTS} bots / game` },
  { range: `≤ $${FREE_TIER_OUTPUT_PRICE_BANDS.SINGLE_MAX}`, cap: '1 bot / game' },
  { range: `> $${FREE_TIER_OUTPUT_PRICE_BANDS.SINGLE_MAX}`, cap: 'Paid only' },
];

export default function ModelsPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-20 pt-10">
      <header className="mb-7">
        <div className="label-caps mb-2">Catalog</div>
        <h1 className="font-serif text-4xl text-cream md:text-5xl">Models</h1>
        <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-sage">
          Every model you can seat at the table — what it costs to run, and where it&rsquo;s
          available. Free gives you a price-banded subset with per-game caps; Paid unlocks the
          whole catalog with no limits.
        </p>
      </header>

      <Panel className="mb-10 grid gap-6 p-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="flex flex-col gap-3 text-[13px] leading-relaxed text-sage">
          <div className="font-serif text-xl text-cream">How free-tier caps are derived</div>
          <p>
            The metric is a model&rsquo;s <span className="text-cream">output price</span> ($/1M
            tokens) — the dominant generation cost. Caps aren&rsquo;t hand-set; they&rsquo;re
            computed straight from that price, so every cap stays in step with the model&rsquo;s
            cost.
          </p>
          <p>
            <span className="text-cream">Thinking handling:</span> hybrid reasoning models always
            run with thinking on and burn extra reasoning tokens beyond the sticker rate, so
            their effective price is multiplied by{' '}
            <span className="text-cream">{FREE_TIER_THINKING_COST_FACTOR}×</span> before banding.
            Always-on reasoning models are banded as listed.
          </p>
        </div>
        <table className="h-fit w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="label-caps border-b border-line pb-2 text-left text-[10px] text-sage-dim">
                Output price (effective)
              </th>
              <th className="label-caps border-b border-line pb-2 text-right text-[10px] text-sage-dim">
                Free-tier cap
              </th>
            </tr>
          </thead>
          <tbody>
            {PRICE_BANDS.map((b) => (
              <tr key={b.range}>
                <td className="border-b border-line-soft py-2.5 text-sage">{b.range}</td>
                <td className="border-b border-line-soft py-2.5 text-right text-cream">{b.cap}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <CapsLabel className="mb-1 block">The catalog</CapsLabel>
      <ModelsCatalog />

      <Panel className="mt-8 p-4">
        <p className="text-[13px] leading-relaxed text-sage">
          On the <span className="text-cream">Paid tier</span> the entire catalog above is
          available with <span className="text-cream">no per-game bot caps</span> — the free-tier
          column shows the limit that applies when you play for free. Paid games bill model cost
          + 30% against your prepaid balance.
        </p>
      </Panel>
    </main>
  );
}
