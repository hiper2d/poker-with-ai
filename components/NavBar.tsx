import Link from 'next/link';
import { auth, signIn, signOut } from '@/auth';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import { Avatar } from '@/components/ui';

const NAV_LINKS = [
  { href: '/games', label: 'Tables' },
  { href: '/games/new', label: 'Host' },
  { href: '/profile', label: 'Profile' },
];

export default async function NavBar() {
  const session = await auth();
  const initial = (session?.user?.name ?? session?.user?.email ?? '?')[0]?.toUpperCase();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-page">
      <div className="mx-auto flex max-w-6xl items-center gap-5 px-5 py-3">
        <Link href="/" className="flex flex-none items-baseline gap-2.5">
          <span className="font-serif text-[26px] tracking-[0.04em] text-gold-pale">Poker with AI</span>
          <span className="label-caps text-[10px]">No-limit hold&rsquo;em</span>
        </Link>
        <nav className="flex flex-1 gap-1 overflow-x-auto">
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
        <ThemeSwitcher />
        {session?.user ? (
          <div className="flex flex-none items-center gap-3">
            <Avatar name={initial ?? '?'} size="sm" />
            <form
              action={async () => {
                'use server';
                await signOut({ redirectTo: '/' });
              }}
            >
              <button className="pill min-h-9">Leave</button>
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
