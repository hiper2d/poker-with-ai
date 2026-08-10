import { getUserProfile } from '@/app/actions/user-actions';
import { auth } from '@/auth';
import ProfileKeys from '@/components/ProfileKeys';
import ProfileTierCards from '@/components/ProfileTierCards';

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-sage">Sign in to manage your profile.</p>
      </main>
    );
  }
  const profile = await getUserProfile();
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
        <ProfileTierCards initialTier={profile.tier} />
        {profile.tier === 'api' ? (
          <ProfileKeys initial={profile} />
        ) : (
          <p className="text-xs text-olive">
            You&rsquo;re playing on platform keys — your own API keys are used only on the
            &ldquo;Your keys&rdquo; plan.
          </p>
        )}
      </div>
    </main>
  );
}
