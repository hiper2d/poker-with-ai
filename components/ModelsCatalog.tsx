'use client';

import { useState } from 'react';
import { Panel } from '@/components/ui';
import { PROVIDER_NAMES, SUPPORTED_MODELS } from '@/config/models';
import { MODEL_PRICING } from '@/config/pricing';
import {
  FREE_TIER_LIMITED_MAX_BOTS,
  FREE_TIER_OUTPUT_PRICE_BANDS,
  FREE_TIER_THINKING_COST_FACTOR,
  getFreeTierPolicy,
  isHybridThinkingModel,
} from '@/config/tiers';

type BandId = 'unlim' | 'three' | 'one' | 'paid';
type Filter = 'all' | 'free' | 'paid';

interface CatalogModel {
  id: string;
  name: string;
  provider: string;
  inputPrice: number;
  cachedPrice: number | null;
  price: number; // listed output $/1M
  eff: number | null; // effective output price when the thinking multiplier applies
}

// Cache prices can be tiny (e.g. $0.0028); keep precision instead of rounding to $0.00.
const fmtCached = (price: number): string => parseFloat(price.toFixed(4)).toString();

interface BandMeta {
  id: BandId;
  capLabel: string;
  cap: string;
  range: string;
  desc: string;
  availability: 'free' | 'paid';
  /** pill surface for the band header and per-row cap tags */
  pill: string;
  dot: string;
}

const BAND_META: Record<BandId, BandMeta> = {
  unlim: {
    id: 'unlim',
    capLabel: 'Unlimited bots / game',
    cap: 'Unlimited',
    range: `≤ $${FREE_TIER_OUTPUT_PRICE_BANDS.UNLIMITED_MAX}`,
    desc: 'No per-game limit on Free.',
    availability: 'free',
    pill: 'border-gold text-gold-pale',
    dot: 'bg-gold',
  },
  three: {
    id: 'three',
    capLabel: `Up to ${FREE_TIER_LIMITED_MAX_BOTS} bots / game`,
    cap: `${FREE_TIER_LIMITED_MAX_BOTS} / game`,
    range: `≤ $${FREE_TIER_OUTPUT_PRICE_BANDS.LIMITED_MAX}`,
    desc: `Seat up to ${FREE_TIER_LIMITED_MAX_BOTS} on Free.`,
    availability: 'free',
    pill: 'border-line text-cream',
    dot: 'bg-cream',
  },
  one: {
    id: 'one',
    capLabel: '1 bot / game',
    cap: '1 / game',
    range: `≤ $${FREE_TIER_OUTPUT_PRICE_BANDS.SINGLE_MAX}`,
    desc: 'One per game on Free.',
    availability: 'free',
    pill: 'border-line text-sage',
    dot: 'bg-sage',
  },
  paid: {
    id: 'paid',
    capLabel: 'Paid tier only',
    cap: 'Paid only',
    range: `> $${FREE_TIER_OUTPUT_PRICE_BANDS.SINGLE_MAX}`,
    desc: 'Not available on Free.',
    availability: 'paid',
    pill: 'border-loss text-loss',
    dot: 'bg-loss',
  },
};

const BAND_ORDER: BandId[] = ['unlim', 'three', 'one', 'paid'];

function policyToBand(maxBots: number, available: boolean): BandId {
  if (!available) return 'paid';
  if (maxBots === -1) return 'unlim';
  if (maxBots === FREE_TIER_LIMITED_MAX_BOTS) return 'three';
  return 'one';
}

function buildBands(): Record<BandId, CatalogModel[]> {
  const out: Record<BandId, CatalogModel[]> = { unlim: [], three: [], one: [], paid: [] };
  for (const config of SUPPORTED_MODELS) {
    const pricing = MODEL_PRICING[config.id];
    if (!pricing) continue;
    const policy = getFreeTierPolicy(config.id);
    const band = policyToBand(policy.maxBotsPerGame, policy.available);
    out[band].push({
      id: config.id,
      name: config.displayName,
      provider: PROVIDER_NAMES[config.apiKeyName] ?? config.apiKeyName,
      inputPrice: pricing.inputPerMTok,
      cachedPrice: pricing.cachedInputPerMTok ?? null,
      price: pricing.outputPerMTok,
      // Effective output price: the sticker rate scaled to include hidden reasoning
      // tokens. Shown only for hybrid thinking models, where the multiplier is known
      // (it's what free-tier banding uses).
      eff: isHybridThinkingModel(config.id)
        ? pricing.outputPerMTok * FREE_TIER_THINKING_COST_FACTOR
        : null,
    });
  }
  // Within each band, cheapest first.
  for (const id of BAND_ORDER) {
    out[id].sort(
      (a, b) =>
        a.inputPrice - b.inputPrice || a.price - b.price || (a.eff ?? a.price) - (b.eff ?? b.price),
    );
  }
  return out;
}

const TH = 'label-caps px-5 py-3 text-[10px] text-sage-dim border-b border-line text-right';
const TD = 'px-5 py-3.5 border-b border-line-soft text-right align-middle';

function Band({ meta, models }: { meta: BandMeta; models: CatalogModel[] }) {
  if (models.length === 0) return null;
  return (
    <section className="mt-7">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span
          className={`r-sm inline-flex items-center gap-2 border px-3 py-1 text-[10px] uppercase tracking-[0.14em] ${meta.pill}`}
        >
          <span className={`h-[7px] w-[7px] rounded-full ${meta.dot}`} />
          {meta.capLabel}
        </span>
        <span className="text-[13px] text-sage-dim">{meta.range}</span>
        <span className="text-[13px] text-sage">{meta.desc}</span>
      </div>
      <div className="overflow-x-auto">
        <Panel className="min-w-[560px] overflow-hidden p-0">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={`${TH} text-left`}>Model</th>
                <th className={TH}>In $/1M</th>
                <th className={TH}>Out $/1M</th>
                <th className={TH}>Free tier</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.id}>
                  <td className={`${TD} text-left`}>
                    <span className="flex flex-wrap items-center gap-2 text-sm text-cream">
                      {m.name}
                      {m.eff !== null && (
                        <span className="r-sm border border-line px-1.5 py-0.5 text-[9px] text-sage-dim">
                          ×{FREE_TIER_THINKING_COST_FACTOR}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-sage-dim">{m.provider}</span>
                  </td>
                  <td className={`${TD} whitespace-nowrap text-[13px] text-body`}>
                    {m.inputPrice.toFixed(2)}
                    {m.cachedPrice !== null && (
                      <span className="mt-0.5 block text-[11px] text-sage-dim">
                        cached {fmtCached(m.cachedPrice)}
                      </span>
                    )}
                  </td>
                  <td className={`${TD} whitespace-nowrap text-[13px] text-body`}>
                    {m.price.toFixed(2)}
                    {m.eff !== null && (
                      <span className="mt-0.5 block text-[11px] text-sage-dim">
                        eff {m.eff.toFixed(2)}
                      </span>
                    )}
                  </td>
                  <td className={TD}>
                    <span
                      className={`r-sm inline-flex whitespace-nowrap border px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] ${meta.pill}`}
                    >
                      {meta.cap}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </section>
  );
}

// Pure over static config — computed once at module load.
const BANDS = buildBands();

export default function ModelsCatalog() {
  const bands = BANDS;
  const [filter, setFilter] = useState<Filter>('all');

  const shownIds = BAND_ORDER.filter((id) =>
    filter === 'all' ? true : BAND_META[id].availability === filter,
  );
  const count = shownIds.reduce((n, id) => n + bands[id].length, 0);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1.5">
          {(
            [
              ['all', 'All'],
              ['free', 'On Free'],
              ['paid', 'Paid only'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`pill min-h-8 px-3 text-[11px] ${filter === id ? 'pill-on' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-xs text-sage-dim">{count} models</span>
      </div>
      {shownIds.map((id) => (
        <Band key={id} meta={BAND_META[id]} models={bands[id]} />
      ))}
      <p className="mt-6 max-w-[75ch] text-[12.5px] leading-relaxed text-sage-dim">
        <span className="r-sm mr-1 border border-line px-1.5 py-0.5 text-[9px] text-sage-dim">
          ×{FREE_TIER_THINKING_COST_FACTOR}
        </span>
        and the <span className="text-sage">eff</span> figure mark hybrid reasoning models. A
        reasoning model &ldquo;thinks&rdquo; before it answers, and those hidden thinking tokens
        bill at the output rate on top of the visible reply — so a turn costs more than the
        listed output price. The <span className="text-sage">eff</span> (effective) price scales
        the output rate by ×{FREE_TIER_THINKING_COST_FACTOR} to include that overhead on average.
      </p>
    </div>
  );
}
