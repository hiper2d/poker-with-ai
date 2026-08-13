import {
  getGamesCreatedTodayCount,
  getUserProfile,
} from '@/app/actions/user-actions';
import { auth } from '@/auth';
import BalanceTopUp from '@/components/BalanceTopUp';
import ProfileTierCards from '@/components/ProfileTierCards';
import { CapsLabel, Panel } from '@/components/ui';
import { FREE_TIER_LIMITS } from '@/config/tiers';

function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Panel className="p-4">
      <CapsLabel>{label}</CapsLabel>
      <div className="mt-1.5 font-serif text-2xl leading-none text-cream">{value}</div>
      {note && <div className="mt-1 text-xs text-sage-dim">{note}</div>}
    </Panel>
  );
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-sage">Sign in to manage your profile.</p>
      </main>
    );
  }
  const { payment } = await searchParams;
  const [profile, gamesToday] = await Promise.all([getUserProfile(), getGamesCreatedTodayCount()]);
  const displayName = profile.name ?? profile.email;
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-9">
      <div className="mb-7 flex items-center gap-5">
        <div className="r-md flex h-[64px] w-[64px] items-center justify-center bg-gold font-serif text-3xl text-[color:var(--t-acc-ink)]">
          {displayName[0]?.toUpperCase()}
        </div>
        <div>
          <h1 className="font-serif text-4xl leading-none text-cream">{displayName}</h1>
          <div className="mt-1.5 text-xs uppercase tracking-[0.18em] text-sage-dim">
            {profile.email} · {profile.tier} tier
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-6">
        {payment === 'success' && (
          <p className="r-md border border-gold bg-panel px-4 py-3 text-sm text-cream">
            Payment received — your balance is updated.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          {profile.tier === 'paid' ? (
            <StatTile label="Balance" value={`$${profile.balance.toFixed(2)}`} note="prepaid" />
          ) : (
            <StatTile
              label="Games today"
              value={`${gamesToday} / ${FREE_TIER_LIMITS.GAMES_PER_CALENDAR_DAY}`}
              note="resets 00:00 UTC"
            />
          )}
          <StatTile
            label="This month"
            value={`$${profile.monthlySpendUsd.toFixed(2)}`}
            note={profile.tier === 'paid' ? 'billed to balance' : 'platform pays'}
          />
          <StatTile
            label="Catalog"
            value={profile.tier === 'paid' ? 'Full' : 'Banded'}
            note={profile.tier === 'paid' ? 'every model' : 'per-model caps'}
          />
        </div>
        {profile.tier === 'paid' && <BalanceTopUp />}
        <ProfileTierCards initialTier={profile.tier} />
      </div>
    </main>
  );
}
