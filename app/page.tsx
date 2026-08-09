import Link from 'next/link';
import { auth } from '@/auth';

export default async function Home() {
  const session = await auth();
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-5 py-14">
      <div className="grid items-center gap-12 md:grid-cols-2">
        <div className="flex flex-col gap-5">
          <div className="label-caps">Tonight at the table</div>
          <h1 className="max-w-[14ch] font-serif text-5xl leading-[1.05] text-cream md:text-6xl">
            Five rivals. One seat left.
          </h1>
          <p className="max-w-[42ch] text-sm leading-relaxed text-sage">
            No-limit hold&rsquo;em against opponents who talk, tilt, and remember how you played
            the last one. Every character is played by a different AI model.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            {session?.user ? (
              <>
                <Link href="/games/new" className="btn-gold flex min-h-[52px] items-center px-6 text-sm">
                  Host a table
                </Link>
                <Link href="/games" className="btn-moss flex min-h-[52px] items-center px-6 text-sm">
                  My tables
                </Link>
              </>
            ) : (
              <p className="text-sm text-olive">Sign in (top right) to take a seat.</p>
            )}
          </div>
        </div>
        <div className="table-felt hidden md:block">
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            <div className="text-[10px] uppercase tracking-[0.24em] text-sage-dim">Open seats</div>
            <div className="font-serif text-4xl text-parchment">7 / 8</div>
          </div>
        </div>
      </div>
    </main>
  );
}
