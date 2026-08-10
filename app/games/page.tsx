import Link from 'next/link';
import { auth } from '@/auth';
import { listGames } from '@/app/actions/game-actions';

export default async function GamesPage() {
  const session = await auth();
  if (!session?.user) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-sage">Sign in to see your tables.</p>
      </main>
    );
  }
  const games = await listGames();
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-9">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="label-caps mb-1.5">Tonight at the table</div>
          <h1 className="font-serif text-5xl leading-none text-cream">Pick your table</h1>
        </div>
        <Link href="/games/new" className="btn-gold flex min-h-12 items-center px-6 text-sm">
          Host a table
        </Link>
      </div>
      {games.length === 0 ? (
        <p className="text-sm text-sage">
          No tables yet —{' '}
          <Link href="/games/new" className="text-gold hover:text-gold-pale">
            host one
          </Link>
          .
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
          {games.map((game) => {
            const alive = game.seats.filter((s) => s.status === 'active').length;
            return (
              <Link
                key={game.id}
                href={`/games/${game.id}`}
                className="flex flex-col overflow-hidden r-md shadow-theme border border-line bg-panel transition hover:border-gold"
              >
                <div className="border-b border-line px-4.5 py-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-serif text-2xl text-cream">{game.theme}</span>
                    <span className="rounded-full border border-line px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-sage">
                      {game.status.replaceAll('_', ' ').toLowerCase()}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-xs text-sage-dim">{game.scene}</div>
                </div>
                <div className="grid grid-cols-3 gap-2.5 px-4.5 pb-4">
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.2em] text-olive">Seats</div>
                    <div className="text-[15px] tabular-nums text-parchment">
                      {alive}/{game.seats.length}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.2em] text-olive">Hand</div>
                    <div className="text-[15px] tabular-nums text-parchment">#{game.handNumber}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.2em] text-olive">Opened</div>
                    <div className="text-[15px] text-body">
                      {new Date(game.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
