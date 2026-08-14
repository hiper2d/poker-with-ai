import Link from 'next/link';
import { auth, signIn, signOut } from '@/auth';
import NavMenu from '@/components/NavMenu';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import { Avatar } from '@/components/ui';
import { COLLECTIONS, db } from '@/lib/firebase/server';
import { coerceTier } from '@/models/user';

const NAV_LINKS = [
  { href: '/games', label: 'Tables' },
  { href: '/games/new', label: 'Host' },
  { href: '/models', label: 'Models' },
  { href: '/rules', label: 'Rules' },
  { href: '/profile', label: 'Profile' },
];

export default async function NavBar() {
  const session = await auth();
  const initial = (session?.user?.name ?? session?.user?.email ?? '?')[0]?.toUpperCase();
  // Tier badge next to the avatar (werewolf's navbar pattern) — a link to the plan cards.
  const tier = session?.user?.email
    ? coerceTier((await db.collection(COLLECTIONS.users).doc(session.user.email).get()).data()?.tier)
    : null;
  // z-[45]: above the in-game failure banner (z-40) so nav dropdowns can cover it,
  // below the fullscreen modals (z-50).
  return (
    <header className="sticky top-0 z-[45] border-b border-line bg-page">
      {/* fixed height (not padding-driven): the game screen subtracts it exactly, and any
          drift shows up as a page scrollbar on phones */}
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-3 px-4 sm:h-14 sm:gap-5 sm:px-5">
        <Link href="/" className="flex flex-none items-baseline gap-2.5">
          <span className="font-serif text-[22px] tracking-[0.04em] text-gold-pale sm:text-[26px]">Poker with AI</span>
          {/* sacrificed on narrow screens so the session buttons stay on screen */}
          <span className="label-caps hidden text-[10px] md:inline">No-limit hold&rsquo;em</span>
        </Link>
        {/* wide screens: links inline; narrow: grouped into the Menu dropdown */}
        <nav className="hidden flex-1 gap-1 overflow-x-auto md:flex">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="r-sm px-3.5 py-2 text-[13px] tracking-[0.04em] text-sage hover:text-cream"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex-1 md:hidden" />
        <NavMenu links={NAV_LINKS} />
        <ThemeSwitcher />
        {session?.user ? (
          <div className="flex flex-none items-center gap-3">
            {tier && (
              <Link
                href="/profile"
                className={`hidden rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] sm:inline ${
                  tier === 'paid' ? 'border-gold text-gold-pale' : 'border-line text-sage'
                }`}
              >
                {tier}
              </Link>
            )}
            <Avatar name={initial ?? '?'} size="sm" />
            <form
              action={async () => {
                'use server';
                await signOut({ redirectTo: '/' });
              }}
            >
              <button className="pill min-h-9 !px-2.5" title="Sign out" aria-label="Sign out">
                {/* door with a leaving arrow */}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M10 13.5H4.5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1H10" />
                  <path d="M13.5 8H7M11 5.5L13.5 8L11 10.5" />
                </svg>
              </button>
            </form>
          </div>
        ) : (
          <div className="flex flex-none items-center gap-2">
            <form
              action={async () => {
                'use server';
                await signIn('github');
              }}
            >
              <button className="pill min-h-9">GitHub</button>
            </form>
            <form
              action={async () => {
                'use server';
                await signIn('google');
              }}
            >
              <button className="pill min-h-9">Google</button>
            </form>
          </div>
        )}
      </div>
    </header>
  );
}
