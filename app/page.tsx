import Image from 'next/image';
import Link from 'next/link';
import { auth, signIn } from '@/auth';
import { CapsLabel, Panel } from '@/components/ui';
import { PROVIDER_NAMES, SUPPORTED_MODELS } from '@/config/models';
import { FREE_TIER_LIMITS } from '@/config/tiers';
import gameShot from '@/docs/screenshots/kings.png';

/**
 * Landing page. Composed from the "Parlor" design language (auth-screen hero + pricing
 * layout in the Poker Parlor Pages design) on the app's theme tokens, so it follows the
 * pixel/terminal themes too.
 */

// Hero table cast — display names echo the kind of table the GM deals.
const HERO_SEATS = [
  { name: 'Vex', tag: 'Claude', pos: { left: '50%', top: '-4%' } },
  { name: 'Duchess', tag: 'GPT', pos: { left: '92%', top: '26%' } },
  { name: 'Ilban', tag: 'Gemini', pos: { left: '92%', top: '74%' } },
  { name: 'Mara', tag: 'Grok', pos: { left: '8%', top: '74%' } },
  { name: 'Otto', tag: 'DeepSeek', pos: { left: '8%', top: '26%' } },
];

const FEATURES = [
  {
    title: 'Rivals in character',
    body: 'The table talks. Characters needle you mid-hand, react to bad beats, and keep private notes on how you play — their reads survive between hands.',
  },
  {
    title: 'A different mind in every seat',
    body: 'Each character is dealt a different AI model. Claude bluffing into Gemini while GPT folds the winner — every table is a live model comparison.',
  },
  {
    title: 'Real no-limit hold’em',
    body: 'A full engine underneath: blinds climb, side pots split correctly, showdowns resolve by the book. The story is dressing — the poker is real.',
  },
];

const STEPS = [
  {
    title: 'Name a theme',
    body: 'Dune, Cyberpunk Night City, 1920s Chicago — one line is enough.',
  },
  {
    title: 'Meet the cast',
    body: 'The game master writes the scene and deals rival characters. Edit any name, story, or model before the table opens.',
  },
  {
    title: 'Play until one stack remains',
    body: 'Bet, talk, tilt them if you can. Chat never blocks the deal.',
  },
];

export default async function Home() {
  const session = await auth();
  const providerCount = Object.keys(PROVIDER_NAMES).length;

  const cta = session?.user ? (
    <div className="mt-2 flex flex-wrap gap-3">
      <Link href="/games/new" className="btn-gold flex min-h-[52px] items-center px-6 text-sm">
        Host a table
      </Link>
      <Link href="/games" className="btn-moss flex min-h-[52px] items-center px-6 text-sm">
        My tables
      </Link>
    </div>
  ) : (
    <div className="mt-2 flex flex-wrap items-center gap-3">
      <form
        action={async () => {
          'use server';
          await signIn('github', { redirectTo: '/games/new' });
        }}
      >
        <button className="btn-gold flex min-h-[52px] items-center px-6 text-sm">
          Sit down with GitHub
        </button>
      </form>
      <form
        action={async () => {
          'use server';
          await signIn('google', { redirectTo: '/games/new' });
        }}
      >
        <button className="btn-moss flex min-h-[52px] items-center px-6 text-sm">
          Sit down with Google
        </button>
      </form>
      <span className="text-xs text-olive">Free to play — no card, no keys.</span>
    </div>
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-20 px-5 pb-24 pt-14">
      {/* ---- Hero ---- */}
      <section className="grid items-center gap-12 md:grid-cols-2">
        <div className="flex flex-col gap-5">
          <div className="label-caps">Tonight at the table</div>
          <h1 className="max-w-[14ch] font-serif text-5xl leading-[1.05] text-cream md:text-6xl">
            Five rivals. One seat left.
          </h1>
          <p className="max-w-[42ch] text-sm leading-relaxed text-sage">
            No-limit hold&rsquo;em against opponents who talk, tilt, and remember how you played
            the last one. Every character is played by a different AI model.
          </p>
          {cta}
        </div>
        <div className="relative hidden px-10 py-12 md:block">
          <div className="table-felt">
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
              <div className="text-[10px] uppercase tracking-[0.24em] text-sage-dim">Open seats</div>
              <div className="font-serif text-4xl text-parchment">1 / 6</div>
            </div>
          </div>
          {HERO_SEATS.map((s) => (
            <div
              key={s.name}
              style={{ position: 'absolute', ...s.pos, transform: 'translate(-50%,-50%)' }}
              className="r-md flex items-center gap-2 border border-line bg-panel px-3 py-1.5 shadow-theme"
            >
              <div className="r-sm flex h-6 w-6 flex-none items-center justify-center bg-gold font-serif text-[11px] text-[color:var(--t-acc-ink)]">
                {s.name[0]}
              </div>
              <div className="leading-tight">
                <div className="text-[12px] text-cream">{s.name}</div>
                <div className="text-[9px] uppercase tracking-[0.14em] text-sage-dim">{s.tag}</div>
              </div>
            </div>
          ))}
          <div
            style={{ position: 'absolute', left: '50%', top: '104%', transform: 'translate(-50%,-50%)' }}
            className="r-md border border-gold bg-panel px-4 py-1.5 text-[11px] uppercase tracking-[0.18em] text-gold-pale shadow-theme"
          >
            Your seat
          </div>
        </div>
      </section>

      {/* ---- Product shot ---- */}
      <section>
        <Panel className="overflow-hidden p-2">
          <Image
            src={gameShot}
            alt="A themed table mid-hand: the board dealt, rivals talking, action on the player"
            className="r-sm w-full"
            placeholder="blur"
            priority={false}
          />
        </Panel>
        <p className="mt-3 text-center text-xs text-sage-dim">
          A Star Wars table mid-hand — every voice at it is a different model.
        </p>
      </section>

      {/* ---- Features ---- */}
      <section>
        <div className="mb-6">
          <div className="label-caps mb-2">Why it&rsquo;s different</div>
          <h2 className="font-serif text-3xl text-cream md:text-4xl">
            Not bots. Characters with a bankroll.
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {FEATURES.map((f) => (
            <Panel key={f.title} className="flex flex-col gap-2.5 p-5">
              <div className="font-serif text-xl text-cream">{f.title}</div>
              <p className="text-[13px] leading-relaxed text-sage">{f.body}</p>
            </Panel>
          ))}
        </div>
      </section>

      {/* ---- How a night unfolds ---- */}
      <section className="grid items-start gap-10 md:grid-cols-[1fr_1.2fr]">
        <div>
          <div className="label-caps mb-2">How a night unfolds</div>
          <h2 className="max-w-[16ch] font-serif text-3xl leading-tight text-cream md:text-4xl">
            One theme in, a whole table out.
          </h2>
        </div>
        <ol className="flex flex-col gap-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <div className="r-sm flex h-9 w-9 flex-none items-center justify-center border border-gold font-serif text-lg text-gold-pale">
                {i + 1}
              </div>
              <div>
                <div className="font-serif text-lg text-cream">{s.title}</div>
                <p className="max-w-[52ch] text-[13px] leading-relaxed text-sage">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ---- The card room roster ---- */}
      <section>
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <div className="label-caps mb-2">The card room roster</div>
            <h2 className="font-serif text-3xl text-cream">
              {SUPPORTED_MODELS.length} models from {providerCount} labs
            </h2>
          </div>
          <p className="max-w-[40ch] text-xs leading-relaxed text-sage-dim">
            Frontier and budget models alike — cheap tables are a real option, expensive ones
            are a real show.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.values(PROVIDER_NAMES).map((provider) => (
            <span
              key={provider}
              className="r-sm inline-flex items-center border border-line px-3.5 py-2 text-[13px] tracking-[0.04em] text-sage"
            >
              {provider}
            </span>
          ))}
        </div>
      </section>

      {/* ---- Tiers ---- */}
      <section>
        <div className="mb-6 text-center">
          <div className="label-caps mb-2">Buy in to the parlor</div>
          <h2 className="font-serif text-3xl text-cream md:text-4xl">Free to sit. Pay to go deep.</h2>
        </div>
        <div className="mx-auto grid max-w-3xl gap-4 md:grid-cols-2">
          <Panel className="flex flex-col gap-3 p-5">
            <div>
              <CapsLabel>Free</CapsLabel>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span className="font-serif text-2xl leading-none text-cream">$0</span>
                <span className="text-xs text-sage-dim">· platform pays</span>
              </div>
            </div>
            <ul className="flex flex-col gap-1.5 text-[13px] text-body">
              <li>Nothing to bring or configure</li>
              <li>Price-banded model subset with per-game caps</li>
              <li>Up to {FREE_TIER_LIMITS.GAMES_PER_CALENDAR_DAY} games a day</li>
            </ul>
          </Panel>
          <Panel variant="glow" className="flex flex-col gap-3 border-gold p-5">
            <div>
              <CapsLabel>Paid</CapsLabel>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span className="font-serif text-2xl leading-none text-cream">Pay as you go</span>
                <span className="text-xs text-sage-dim">· cost + 30%</span>
              </div>
            </div>
            <ul className="flex flex-col gap-1.5 text-[13px] text-body">
              <li>Full catalog, no per-game or daily limits</li>
              <li>Prepaid balance, billed per model call</li>
              <li>Top up from your profile anytime</li>
            </ul>
          </Panel>
        </div>
      </section>

      {/* ---- Closing CTA ---- */}
      <section className="flex flex-col items-center gap-5 text-center">
        <h2 className="max-w-[20ch] font-serif text-4xl leading-tight text-cream">
          The cards are shuffled. The chatter&rsquo;s already started.
        </h2>
        {cta}
      </section>
    </main>
  );
}
