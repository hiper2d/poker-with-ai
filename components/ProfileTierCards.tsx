'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateUserTier } from '@/app/actions/user-actions';
import { Button, CapsLabel, Panel } from '@/components/ui';
import type { UserTier } from '@/models/user';

interface TierInfo {
  id: UserTier;
  name: string;
  cost: string;
  costNote: string;
  blurb: string;
  feats: string[];
  comingSoon?: boolean;
}

const TIERS: TierInfo[] = [
  {
    id: 'free',
    name: 'Free',
    cost: '$0',
    costNote: 'platform pays',
    blurb: 'Play on the shared platform keys — capped so it stays free.',
    feats: [
      'Nothing to bring or configure',
      'Price-banded model subset',
      'Per-model caps: unlimited, 3, or 1 bot per game',
    ],
  },
  {
    id: 'api',
    name: 'Your keys',
    cost: 'At cost',
    costNote: 'billed by providers',
    blurb: 'Bring your own API keys and pay the providers directly.',
    feats: [
      'Full catalog for every key you add',
      'No per-game bot caps',
      'Keys stay in your profile, used server-side only',
    ],
  },
  {
    id: 'paid',
    name: 'Paid',
    cost: 'Pay as you go',
    costNote: 'cost + 30%',
    blurb: 'Whole catalog on platform keys, billed from a prepaid balance.',
    feats: ['Full model catalog', 'No per-game limits', 'Prepaid balance, top up anytime'],
    comingSoon: true,
  },
];

export default function ProfileTierCards({ initialTier }: { initialTier: UserTier }) {
  const router = useRouter();
  const [tier, setTier] = useState(initialTier);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const switchTo = (target: UserTier) =>
    startTransition(async () => {
      setError(null);
      try {
        const profile = await updateUserTier(target);
        setTier(profile.tier);
        router.refresh();
      } catch (e) {
        setError(String(e instanceof Error ? e.message : e));
      }
    });

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p className="r-md border border-loss bg-panel px-4 py-3 text-sm text-loss">{error}</p>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {TIERS.map((info) => {
          const isCurrent = tier === info.id;
          return (
            <Panel
              key={info.id}
              variant={isCurrent ? 'glow' : 'card'}
              className={`relative flex flex-col gap-3 p-5 ${isCurrent ? 'border-gold' : ''}`}
            >
              {isCurrent && (
                <span className="absolute -top-2.5 left-4 rounded-full bg-gold px-2.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-[color:var(--t-acc-ink)]">
                  Your plan
                </span>
              )}
              <div>
                <CapsLabel>{info.name}</CapsLabel>
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="font-serif text-2xl leading-none text-cream">{info.cost}</span>
                  <span className="text-xs text-sage-dim">· {info.costNote}</span>
                </div>
              </div>
              <p className="text-[13px] leading-relaxed text-body">{info.blurb}</p>
              <ul className="flex flex-col gap-1.5 text-[13px] text-body">
                {info.feats.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="mt-[7px] h-1 w-1 flex-none rounded-full bg-gold" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-2">
                {isCurrent ? (
                  <div className="text-xs uppercase tracking-[0.18em] text-sage-dim">Active</div>
                ) : info.comingSoon ? (
                  <Button variant="dark" disabled className="w-full opacity-60">
                    Coming soon
                  </Button>
                ) : (
                  <Button
                    variant="moss"
                    onClick={() => switchTo(info.id)}
                    disabled={isPending}
                    className="w-full"
                  >
                    {isPending ? 'Switching…' : `Switch to ${info.name}`}
                  </Button>
                )}
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
