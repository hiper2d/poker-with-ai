import type { Metadata } from 'next';
import Link from 'next/link';
import { CapsLabel, Panel } from '@/components/ui';
import { GAME_CONFIG } from '@/config/game';
import { FREE_TIER_LIMITS } from '@/config/tiers';

export const metadata: Metadata = {
  title: 'How the Poker Table Runs',
  description:
    "The rules of playing Hold'em poker against AI rivals — sit-n-go format, blinds, the LLM characters' memory, table talk, and what each tier allows.",
  alternates: { canonical: '/rules' },
};

function Section({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <CapsLabel className="mb-2 block">{label}</CapsLabel>
      <h2 className="mb-4 font-serif text-2xl text-cream md:text-3xl">{title}</h2>
      {children}
    </section>
  );
}

export default function RulesPage() {
  const { startingStack, handsPerBlindLevel, blindLevels, minPlayers, maxPlayers, chatBudget } =
    GAME_CONFIG;
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-12 px-5 pb-20 pt-10">
      <header>
        <div className="label-caps mb-2">House rules</div>
        <h1 className="font-serif text-4xl text-cream md:text-5xl">How the table runs</h1>
        <p className="mt-3 max-w-[58ch] text-sm leading-relaxed text-sage">
          Standard no-limit hold&rsquo;em in a sit-n-go shell, played against AI characters who
          talk and remember. Everything below is the actual configuration the engine runs on.
        </p>
      </header>

      <Section label="The format" title="Sit-n-go, winner takes the table">
        <div className="flex flex-col gap-4">
          <p className="text-[13px] leading-relaxed text-sage">
            {minPlayers}–{maxPlayers} seats, everyone starts with{' '}
            <span className="text-cream">{startingStack.toLocaleString('en-US')} chips</span>.
            There are no re-buys: lose your stack and you&rsquo;re out, the game ends when one
            stack holds everything. Blinds climb every{' '}
            <span className="text-cream">{handsPerBlindLevel} hands</span> so tables can&rsquo;t
            stall forever.
          </p>
          <Panel className="overflow-hidden p-0">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className="label-caps border-b border-line px-4 py-2.5 text-left text-[10px] text-sage-dim">
                    Level
                  </th>
                  <th className="label-caps border-b border-line px-4 py-2.5 text-right text-[10px] text-sage-dim">
                    Blinds
                  </th>
                  <th className="label-caps border-b border-line px-4 py-2.5 text-right text-[10px] text-sage-dim">
                    Hands
                  </th>
                </tr>
              </thead>
              <tbody>
                {blindLevels.map((level, i) => (
                  <tr key={level.bigBlind}>
                    <td className="border-b border-line-soft px-4 py-2 text-sage">{i + 1}</td>
                    <td className="border-b border-line-soft px-4 py-2 text-right text-cream">
                      {level.smallBlind.toLocaleString('en-US')} /{' '}
                      {level.bigBlind.toLocaleString('en-US')}
                    </td>
                    <td className="border-b border-line-soft px-4 py-2 text-right text-sage-dim">
                      {i === blindLevels.length - 1
                        ? `${i * handsPerBlindLevel + 1}+`
                        : `${i * handsPerBlindLevel + 1}–${(i + 1) * handsPerBlindLevel}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      </Section>

      <Section label="The poker" title="Real hold’em underneath">
        <p className="max-w-[58ch] text-[13px] leading-relaxed text-sage">
          Each hand runs the standard streets — preflop, flop, turn, river — with check, call,
          bet, raise, and fold all played by the book. All-ins build side pots that split
          correctly at showdown, and the best five-card hand takes each pot it&rsquo;s entitled
          to. Folded pots never show cards; showdowns reveal exactly who was entitled to see
          what. The story dressing changes nothing about the poker.
        </p>
      </Section>

      <Section label="The rivals" title="Characters with memory">
        <ul className="flex max-w-[58ch] flex-col gap-3 text-[13px] leading-relaxed text-sage">
          <li>
            <span className="text-cream">One model per seat.</span> Every rival character is
            played by the AI model dealt to it when the table was created — see the{' '}
            <Link href="/models" className="text-gold-pale underline-offset-2 hover:underline">
              catalog
            </Link>{' '}
            for who can sit where. The game master narrating the table runs on its own model.
          </li>
          <li>
            <span className="text-cream">Private reasoning.</span> Rivals decide with reasoning
            you never see; only their actions and table talk reach the table.
          </li>
          <li>
            <span className="text-cream">They keep book on you.</span> Every few hands each rival
            files the recent table talk into private notes — style, tells, bluffs they caught —
            and plays future hands against those reads. Nothing they learn is ever shown to you.
          </li>
        </ul>
      </Section>

      <Section label="Table talk" title="The chat never blocks the deal">
        <ul className="flex max-w-[58ch] flex-col gap-3 text-[13px] leading-relaxed text-sage">
          <li>
            <span className="text-cream">The Pit Boss routes the room.</span> Say something and
            the floor supervisor decides which {GAME_CONFIG.chatRouterMinBots}–
            {GAME_CONFIG.chatRouterMaxBots} rivals answer. You can also hand the mic to someone
            directly, or nudge the table to talk among themselves.
          </li>
          <li>
            <span className="text-cream">Conversation is budgeted.</span> Bot replies are capped
            per hand and per game so a chatty table can&rsquo;t burn without limit: {' '}
            {chatBudget.free.perHand}/hand and {chatBudget.free.perGame}/game on Free,{' '}
            {chatBudget.default.perHand}/hand and {chatBudget.default.perGame}/game on Paid. Your
            own messages always land — the table just goes quiet once the budget is spent.
          </li>
          <li>
            <span className="text-cream">Chat and cards run on separate lanes.</span> A slow or
            failed chat reply never delays a betting decision, and vice versa. If a model call
            fails, that lane pauses with a Retry — optionally on a different model for that one
            call.
          </li>
        </ul>
      </Section>

      <Section label="Stakes" title="What each tier allows">
        <p className="max-w-[58ch] text-[13px] leading-relaxed text-sage">
          <span className="text-cream">Free</span> plays on the platform&rsquo;s keys: a
          price-banded model subset with per-game caps and up to{' '}
          {FREE_TIER_LIMITS.GAMES_PER_CALENDAR_DAY} games per calendar day (00:00 UTC reset).{' '}
          <span className="text-cream">Paid</span> unlocks the whole catalog with no limits and
          bills model cost + 30% against a prepaid balance — manage both on your{' '}
          <Link href="/profile" className="text-gold-pale underline-offset-2 hover:underline">
            profile
          </Link>
          . A table keeps playing under the tier it was created with.
        </p>
      </Section>

      <Section label="Housekeeping" title="Table lifetime">
        <p className="max-w-[58ch] text-[13px] leading-relaxed text-sage">
          Tables expire {GAME_CONFIG.gameTtlDays} days after creation — finished or not — and you
          can delete one yourself anytime from the Tables page. Chip counts are play money;
          nothing at the table is wagered for real.
        </p>
      </Section>
    </main>
  );
}
