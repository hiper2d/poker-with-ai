'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { advanceChat, advanceGame, humanAction, sendChatMessage } from '@/app/actions/play-actions';
import { Button, CapsLabel, ChatBubble, Pill, PlayingCard, SeatPill, TableFelt } from '@/components/ui';
import { SUPPORTED_MODELS } from '@/config/models';
import type { ActionType, HandState } from '@/lib/engine/types';
import type { Game, GameMessage } from '@/models/game';

const AVATAR_COLORS = ['#5c8f7b', '#8d6a3f', '#a35f6d', '#4f6f8f', '#96608f', '#6f8f4f', '#8f7b4f'];
const PUMP_DELAY_MS = 600;
const BUBBLE_MS = 5200;
const TALK_TYPES = ['TABLE_TALK', 'BOT_ANSWER', 'BOT_INTRO'];
const EVENT_TYPES = ['GAME_ACTION', 'HAND_RESULT', 'COMPACTION'];

function avatarColor(game: Game, name: string): string {
  const idx = game.bots.findIndex((b) => b.name === name);
  return idx >= 0 ? AVATAR_COLORS[idx % AVATAR_COLORS.length] : '#d8b25a';
}

function isHumanTurn(game: Game): boolean {
  return (
    game.status === 'BETTING' &&
    !!game.hand &&
    !game.hand.complete &&
    game.hand.toAct === game.humanPlayerName
  );
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
}

interface HumanLegal {
  callAmount: number;
  canRaise: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
  pot: number;
}

function humanLegal(hand: HandState, name: string): HumanLegal | null {
  const me = hand.players.find((p) => p.name === name);
  if (!me) return null;
  const myStack = me.startingStack - me.totalCommitted;
  const callAmount = Math.min(hand.currentBet - me.streetCommitted, myStack);
  const maxRaiseTo = me.streetCommitted + myStack;
  return {
    callAmount,
    canRaise: maxRaiseTo > hand.currentBet,
    minRaiseTo: Math.min(hand.currentBet + hand.minRaise, maxRaiseTo),
    maxRaiseTo,
    pot: hand.players.reduce((sum, p) => sum + p.totalCommitted, 0),
  };
}

export default function GameRoom({
  game: initialGame,
  messages: initialMessages,
}: {
  game: Game;
  messages: GameMessage[];
}) {
  const [game, setGame] = useState(initialGame);
  const [messages, setMessages] = useState(initialMessages);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [paused, setPaused] = useState(false);
  const [railOpen, setRailOpen] = useState(true);
  const [pumpTick, setPumpTick] = useState(0);
  const [chatTick, setChatTick] = useState(0);
  const [bubbles, setBubbles] = useState<Record<string, string>>({});
  const gameRef = useRef(game);
  const pausedRef = useRef(paused);
  const inFlightRef = useRef(false);
  const chatInFlightRef = useRef(false);
  const chatRemainingRef = useRef(initialGame.chatQueue.length);
  const bubbleSeenRef = useRef(new Set(initialMessages.map((m) => m.id)));
  const bubbleTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  gameRef.current = game;
  pausedRef.current = paused;

  // Seat speech bubbles: any new talk message from a bot pops up at its seat, then fades.
  useEffect(() => {
    for (const m of messages) {
      if (!m.id || bubbleSeenRef.current.has(m.id)) continue;
      bubbleSeenRef.current.add(m.id);
      if (!TALK_TYPES.includes(m.messageType) || typeof m.msg !== 'string') continue;
      const name = m.authorName;
      const text = m.msg;
      setBubbles((b) => ({ ...b, [name]: text }));
      bubbleTimersRef.current.push(
        setTimeout(
          () => setBubbles((b) => (b[name] === text ? { ...b, [name]: '' } : b)),
          BUBBLE_MS,
        ),
      );
    }
  }, [messages]);
  useEffect(() => () => bubbleTimersRef.current.forEach(clearTimeout), []);

  // Chat pump — fully independent of the game pump; drains intros/replies in parallel.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (chatInFlightRef.current) return;
      chatInFlightRef.current = true;
      try {
        while (!cancelled && chatRemainingRef.current > 0) {
          const res = await advanceChat(gameRef.current.id);
          if (cancelled) break;
          chatRemainingRef.current = res.remaining;
          setMessages(res.messages);
          if (!res.progressed) break;
          await new Promise((r) => setTimeout(r, 400));
        }
      } catch {
        // chat failures never block the game — it will retry on the next send/mount
      } finally {
        chatInFlightRef.current = false;
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [chatTick]);

  const onSendChat = useCallback(async (text: string) => {
    const res = await sendChatMessage(gameRef.current.id, text);
    chatRemainingRef.current = res.remaining;
    setMessages(res.messages);
    setChatTick((t) => t + 1);
  }, []);

  // Game pump — one server step at a time until it's the human's turn, pause, or game over.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        while (!cancelled && !pausedRef.current) {
          const g = gameRef.current;
          if (isHumanTurn(g) || g.status === 'GAME_OVER') break;
          const res = await advanceGame(g.id);
          if (cancelled) break;
          setGame(res.game);
          setMessages(res.messages);
          if (!res.progressed) break;
          await new Promise((r) => setTimeout(r, PUMP_DELAY_MS));
        }
      } catch (e) {
        if (!cancelled) setError(String(e instanceof Error ? e.message : e));
      } finally {
        inFlightRef.current = false;
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [pumpTick]);

  const onTogglePause = useCallback(() => {
    setPaused((p) => {
      if (p) setPumpTick((t) => t + 1); // resuming — wake the pump
      return !p;
    });
  }, []);

  const onHumanAction = useCallback(async (type: ActionType, amount?: number) => {
    setActing(true);
    setError(null);
    try {
      const res = await humanAction(gameRef.current.id, type, amount);
      setGame(res.game);
      setMessages(res.messages);
      setPumpTick((t) => t + 1);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setActing(false);
    }
  }, []);

  const myTurn = isHumanTurn(game);
  const events = messages.filter((m) => EVENT_TYPES.includes(m.messageType));
  const lastEvent = events[events.length - 1];
  const { smallBlind, bigBlind } = game.hand ?? { smallBlind: 0, bigBlind: 0 };

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* top bar */}
        <div className="flex flex-none flex-wrap items-center gap-4 border-b border-line px-6 py-3">
          <span className="font-serif text-xl tracking-[0.01em] text-cream">{game.theme}</span>
          <div className="h-4 w-px bg-line" />
          <div className="flex items-center gap-2.5 text-xs uppercase tracking-[0.08em] text-sage">
            <span>Hand #{game.handNumber}</span>
            <span className="text-sage opacity-50">/</span>
            <span>
              Blinds {smallBlind.toLocaleString()} · {bigBlind.toLocaleString()}
            </span>
            <span className="text-sage opacity-50">/</span>
            <span className="text-gold">
              {game.status === 'BETTING' && game.hand && !game.hand.complete
                ? game.hand.street
                : game.status.replaceAll('_', ' ').toLowerCase()}
            </span>
          </div>
          <div className="flex-1" />
          {!myTurn && game.status !== 'GAME_OVER' && !paused && (
            <span className="text-[11px] uppercase tracking-[0.2em] text-gold-pale">
              {game.hand && !game.hand.complete && game.hand.toAct
                ? `${game.hand.toAct} is thinking…`
                : 'dealing…'}
            </span>
          )}
          <Pill selected={!paused} onClick={onTogglePause}>
            {paused ? 'Play' : 'Pause'}
          </Pill>
          <Pill selected={railOpen} onClick={() => setRailOpen((o) => !o)}>
            Table talk
          </Pill>
        </div>

        {/* last event banner */}
        {lastEvent && typeof lastEvent.msg === 'string' && (
          <div className="flex-none px-6 pt-3">
            <div
              key={lastEvent.id}
              className="row-in flex items-center gap-3.5 rounded-2xl border border-line bg-panel shadow-theme px-4.5 py-3"
            >
              <span className="h-2 w-2 flex-none rounded-full bg-gold shadow-[0_0_12px_2px_color-mix(in_srgb,var(--t-acc)_50%,transparent)]" />
              <div className="flex min-w-0 flex-col">
                <div className="text-[10px] uppercase tracking-[0.2em] text-sage">Last event</div>
                <div className="truncate font-serif text-xl leading-tight text-cream">{lastEvent.msg}</div>
              </div>
              <div className="flex-1" />
              <div className="flex-none text-[11px] tracking-[0.1em] text-sage">
                {fmtTime(lastEvent.timestamp)}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mx-6 mt-3 flex flex-none items-center justify-between gap-3 rounded-xl border border-loss bg-panel px-4 py-2.5 text-sm text-loss">
            <span className="truncate">{error}</span>
            <Pill onClick={() => { setError(null); setPumpTick((t) => t + 1); }}>Retry</Pill>
          </div>
        )}

        {/* table */}
        <div className="flex min-h-0 flex-1 items-center justify-center px-10 pb-2 pt-8 xl:px-24">
          <div className="w-full max-w-[880px]">
            <PokerTable game={game} bubbles={bubbles} />
          </div>
        </div>

        <HeroBar game={game} myTurn={myTurn} acting={acting} onAction={onHumanAction} />
      </div>

      <Rail
        game={game}
        messages={messages}
        open={railOpen}
        onToggle={() => setRailOpen((o) => !o)}
        onSend={onSendChat}
      />
    </div>
  );
}

interface ChipFlight {
  id: number;
  from: { left: number; top: number };
  to: { left: number; top: number };
}

/** One chip animating between two points on the felt (bet → stack, stack → pot). */
function FlyingChip({ flight }: { flight: ChipFlight }) {
  const [pos, setPos] = useState(flight.from);
  const [fading, setFading] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setPos(flight.to));
    const fade = setTimeout(() => setFading(true), 460);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fade);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      className="chip-coin -translate-x-1/2 -translate-y-1/2"
      style={{
        left: `${pos.left}%`,
        top: `${pos.top}%`,
        opacity: fading ? 0 : 1,
        transition: 'left 480ms cubic-bezier(0.4,0.85,0.3,1), top 480ms cubic-bezier(0.4,0.85,0.3,1), opacity 200ms ease-out',
      }}
    />
  );
}

function PokerTable({ game, bubbles }: { game: Game; bubbles: Record<string, string> }) {
  const seats = [...game.seats].sort((a, b) => a.seatIndex - b.seatIndex);
  const n = seats.length;
  const humanIdx = seats.findIndex((s) => s.isHuman);
  const pot = game.hand?.players.reduce((sum, p) => sum + p.totalCommitted, 0) ?? 0;
  const [flights, setFlights] = useState<ChipFlight[]>([]);
  const flightIdRef = useRef(0);
  const prevRef = useRef<{ street: string | null; committed: Record<string, number> }>({
    street: null,
    committed: {},
  });

  const seatPos = (i: number) => {
    const angle = ((i - humanIdx) / n) * 2 * Math.PI;
    return { left: 50 + 49 * Math.sin(angle), top: 50 + 50 * Math.cos(angle) };
  };
  // chip stack sits between the seat and the pot
  const stackPos = (i: number) => {
    const p = seatPos(i);
    return { left: p.left + (50 - p.left) * 0.42, top: p.top + (50 - p.top) * 0.4 };
  };

  // Detect bets (chips fly seat → stack) and street changes (stacks sweep → pot).
  useEffect(() => {
    const hand = game.hand;
    const prev = prevRef.current;
    const spawned: ChipFlight[] = [];
    if (hand) {
      const sameStreet = prev.street === `${hand.handNumber}:${hand.street}`;
      for (const p of hand.players) {
        const i = seats.findIndex((s) => s.name === p.name);
        if (i < 0) continue;
        const before = sameStreet ? (prev.committed[p.name] ?? 0) : 0;
        if (sameStreet && p.streetCommitted > before) {
          spawned.push({ id: flightIdRef.current++, from: seatPos(i), to: stackPos(i) });
        }
        if (!sameStreet && (prev.committed[p.name] ?? 0) > 0) {
          spawned.push({
            id: flightIdRef.current++,
            from: stackPos(i),
            to: { left: 50, top: 52 },
          });
        }
      }
      prevRef.current = {
        street: `${hand.handNumber}:${hand.street}`,
        committed: Object.fromEntries(hand.players.map((p) => [p.name, p.streetCommitted])),
      };
    } else {
      prevRef.current = { street: null, committed: {} };
    }
    if (spawned.length) {
      setFlights((f) => [...f, ...spawned]);
      const ids = new Set(spawned.map((s) => s.id));
      setTimeout(() => setFlights((f) => f.filter((x) => !ids.has(x.id))), 800);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.hand?.street, game.hand?.handNumber, game.hand?.players]);

  const lastActionOf = (name: string) => {
    const log = game.hand?.actionLog ?? [];
    for (let i = log.length - 1; i >= 0; i--) {
      if (log[i].player === name && log[i].street === game.hand?.street) {
        const a = log[i];
        return a.type + (a.amount ? ` ${a.amount.toLocaleString()}` : '');
      }
    }
    return '';
  };

  return (
    <TableFelt
      seats={
        <>
          {/* committed-bet chip stacks */}
          {game.hand &&
            !game.hand.complete &&
            game.hand.players.map((p) => {
              const i = seats.findIndex((s) => s.name === p.name);
              if (i < 0 || p.folded || p.streetCommitted <= 0) return null;
              const pos = stackPos(i);
              return (
                <div
                  key={`${p.name}-${p.streetCommitted}`}
                  className="chip-pop absolute z-[12] flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-panel py-0.5 pl-1 pr-2"
                  style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
                >
                  <span className="flex items-center">
                    {[0, 1, 2].map((c) => (
                      <span
                        key={c}
                        className={`h-3 w-3 rounded-full border border-black/50 shadow-sm ${c > 0 ? '-ml-1.5' : ''}`}
                        style={{ background: 'var(--t-chip)' }}
                      />
                    ))}
                  </span>
                  <span className="text-[11px] tabular-nums tracking-[0.02em] text-cream">
                    {p.streetCommitted.toLocaleString()}
                  </span>
                </div>
              );
            })}
          {flights.map((f) => (
            <FlyingChip key={f.id} flight={f} />
          ))}
          {seats.map((seat, i) => {
            const { left, top } = seatPos(i);
            const bot = game.bots.find((b) => b.name === seat.name);
            const model = bot && SUPPORTED_MODELS.find((m) => m.id === bot.aiType);
            const player = game.hand?.players.find((p) => p.name === seat.name);
            const behind = player ? player.startingStack - player.totalCommitted : seat.stack;
            const bubble = bubbles[seat.name];
            const acting = !game.hand?.complete && game.hand?.toAct === seat.name;
            return (
              <div
                key={seat.seatIndex}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${left}%`, top: `${top}%`, zIndex: bubble ? 30 : 20 }}
              >
                {acting && (
                  <>
                    <div className="absolute -top-[13px] left-1/2 z-[2] -translate-x-1/2 whitespace-nowrap rounded-full bg-gold px-2 py-0.5 text-[8px] uppercase tracking-[0.22em] text-[color:var(--t-acc-ink)]">
                      Acting
                    </div>
                  </>
                )}
                <SeatPill
                  name={seat.name}
                  stack={behind}
                  avatarColor={avatarColor(game, seat.name)}
                  isHuman={seat.isHuman}
                  tag={model?.displayName}
                  lastAction={lastActionOf(seat.name)}
                  folded={player?.folded}
                  active={acting}
                  dimmed={seat.status === 'eliminated' || player?.folded}
                  dealer={game.buttonSeat === seat.seatIndex}
                />
                {bubble && (
                  <div className="bubble-pop absolute left-1/2 top-[calc(100%+10px)] z-[35] w-56 -translate-x-1/2">
                    <ChatBubble author={seat.name} authorColor={avatarColor(game, seat.name)}>
                      {bubble}
                    </ChatBubble>
                  </div>
                )}
              </div>
            );
          })}
        </>
      }
    >
      <div className="text-center">
        <div className="text-[10px] uppercase tracking-[0.24em] text-sage">Pot</div>
        <div key={pot} className="pot-pulse font-serif text-4xl leading-none tabular-nums text-parchment">
          {pot.toLocaleString()}
        </div>
      </div>
      <div className="flex min-h-[76px] items-center gap-2">
        {(game.hand?.board ?? []).map((card) => (
          <PlayingCard key={card} card={card} />
        ))}
        {!game.hand && (
          <span className="text-[11px] uppercase tracking-[0.2em] text-sage-dim">
            {game.status === 'GAME_OVER' ? 'Game over' : 'Shuffling up…'}
          </span>
        )}
      </div>
    </TableFelt>
  );
}

function HeroBar({
  game,
  myTurn,
  acting,
  onAction,
}: {
  game: Game;
  myTurn: boolean;
  acting: boolean;
  onAction: (type: ActionType, amount?: number) => void;
}) {
  const hand = game.hand;
  const me = hand?.players.find((p) => p.name === game.humanPlayerName);
  const legal = hand && !hand.complete ? humanLegal(hand, game.humanPlayerName) : null;
  const [raiseTo, setRaiseTo] = useState(0);
  const [sizerOpen, setSizerOpen] = useState(false);

  useEffect(() => {
    if (legal) setRaiseTo((r) => Math.min(Math.max(r, legal.minRaiseTo), legal.maxRaiseTo));
    if (!myTurn) setSizerOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hand?.street, hand?.currentBet, myTurn]);

  if (game.status === 'GAME_OVER') {
    const champion = game.seats.find((s) => s.status === 'active');
    return (
      <div className="mx-6 mb-5 flex-none r-md shadow-theme border border-line bg-panel p-5 text-center">
        <CapsLabel className="mb-1">Game over</CapsLabel>
        <div className="font-serif text-3xl text-gold-pale">
          {champion ? `${champion.name} takes it all` : 'The table is empty'}
        </div>
      </div>
    );
  }
  if (!hand || !me) return <div className="h-5 flex-none" />;

  const presets = legal
    ? [
        ['Min', legal.minRaiseTo],
        ['½ pot', hand.currentBet + Math.round(legal.pot / 2)],
        ['Pot', hand.currentBet + legal.pot],
        ['All in', legal.maxRaiseTo],
      ].map(([label, v]) => [label, Math.min(Math.max(v as number, legal.minRaiseTo), legal.maxRaiseTo)] as const)
    : [];

  return (
    <div className="flex-none px-6 pb-5">
      {myTurn && legal && legal.canRaise && sizerOpen && (
        <div className="mb-3 flex flex-col gap-2.5 r-md shadow-theme border border-line bg-panel p-3.5">
          <div className="flex flex-wrap items-center gap-3">
            <CapsLabel>Bet size</CapsLabel>
            <div className="font-serif text-xl tabular-nums text-parchment">{raiseTo.toLocaleString()}</div>
            <div className="ml-auto flex flex-wrap gap-1.5">
              {presets.map(([label, v]) => (
                <Pill key={label} onClick={() => setRaiseTo(v)}>
                  {label}
                </Pill>
              ))}
            </div>
          </div>
          <input
            type="range"
            min={legal.minRaiseTo}
            max={legal.maxRaiseTo}
            step={hand.bigBlind / 2}
            value={raiseTo}
            onChange={(e) => setRaiseTo(Number(e.target.value))}
            className="accent-gold"
          />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3.5">
        <div className="flex items-center gap-2.5">
          <CapsLabel>Your hand</CapsLabel>
          <div className="flex gap-2">
            {(me.holeCards ?? []).map((card) => (
              <PlayingCard key={card} card={card} />
            ))}
          </div>
          <div className="ml-1">
            <div className="font-serif text-lg leading-tight text-cream">{game.humanPlayerName}</div>
            <div className="text-sm tabular-nums text-gold">
              {(me.startingStack - me.totalCommitted).toLocaleString()}
            </div>
          </div>
        </div>
        <div className="flex-1" />
        {myTurn && legal && (
          <div className="flex flex-wrap items-center gap-2.5">
            <Button variant="dark" size="lg" disabled={acting} onClick={() => onAction('fold')} className="uppercase tracking-[0.08em]">
              Fold
            </Button>
            <Button
              variant="moss"
              size="lg"
              disabled={acting}
              onClick={() => onAction(legal.callAmount ? 'call' : 'check')}
              className="uppercase tracking-[0.08em]"
            >
              {legal.callAmount ? `Call ${legal.callAmount.toLocaleString()}` : 'Check'}
            </Button>
            {legal.canRaise && (
              <Button
                variant="gold"
                size="lg"
                disabled={acting}
                onClick={() => {
                  if (!sizerOpen) setSizerOpen(true);
                  else onAction(hand.currentBet === 0 ? 'bet' : 'raise', raiseTo);
                }}
                className="uppercase tracking-[0.08em]"
              >
                {sizerOpen
                  ? `${hand.currentBet === 0 ? 'Bet' : 'Raise'} ${raiseTo.toLocaleString()}`
                  : `${hand.currentBet === 0 ? 'Bet' : 'Raise'}…`}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Rail({
  game,
  messages,
  open,
  onToggle,
  onSend,
}: {
  game: Game;
  messages: GameMessage[];
  open: boolean;
  onToggle: () => void;
  onSend: (text: string) => Promise<void>;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [eventsShown, setEventsShown] = useState(true);

  const feed = messages.filter(
    (m) =>
      (m.recipientName === 'ALL' || m.recipientName === game.humanPlayerName) &&
      (eventsShown || !EVENT_TYPES.includes(m.messageType)),
  );
  const eventCount = messages.filter((m) => EVENT_TYPES.includes(m.messageType)).length;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [feed.length]);

  const submit = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft('');
    try {
      await onSend(text);
    } catch {
      setDraft(text);
    } finally {
      setSending(false);
    }
  };

  return (
    <aside
      className="flex-none overflow-hidden border-l border-line bg-page transition-[width] duration-300"
      style={{ width: open ? 320 : 52 }}
    >
      {open ? (
        <div className="flex h-full w-80 flex-col">
          <div className="flex flex-none items-center justify-between px-4.5 pb-2.5 pt-4">
            <CapsLabel>Table talk</CapsLabel>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setEventsShown((e) => !e)}
                className={`rounded-full border px-2.5 py-1 text-[11px] ${
                  eventsShown
                    ? 'border-gold bg-[rgba(216,178,90,0.14)] text-cream'
                    : 'border-line text-sage hover:border-gold-dark hover:text-gold-pale'
                }`}
              >
                Events {eventCount}
              </button>
              <button
                onClick={onToggle}
                className="rounded-full border border-line px-2.5 py-1 text-[11px] text-sage hover:border-gold-dark hover:text-gold-pale"
              >
                Hide ›
              </button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4.5 pb-3">
            {feed.map((m, i) => {
              if (EVENT_TYPES.includes(m.messageType)) {
                const isResult = m.messageType === 'HAND_RESULT';
                const isHandMark = typeof m.msg === 'string' && m.msg.startsWith('Hand #');
                return (
                  <div
                    key={m.id}
                    className="row-in flex gap-2 py-px"
                    style={{ opacity: i === feed.length - 1 ? 0.95 : 0.6 }}
                  >
                    <span className="flex-none pt-px text-[9px] tabular-nums text-sage opacity-60">
                      {fmtTime(m.timestamp)}
                    </span>
                    <span
                      className={`text-[11px] leading-snug tracking-[0.02em] ${isResult ? 'text-gold' : 'text-sage'}`}
                    >
                      {typeof m.msg === 'string' ? m.msg : ''}
                    </span>
                  </div>
                );
              }
              const isSystem = m.messageType === 'GAME_STORY';
              const mine = m.authorName === game.humanPlayerName && !isSystem;
              return (
                <ChatBubble
                  key={m.id}
                  author={m.authorName}
                  authorColor={avatarColor(game, m.authorName)}
                  mine={mine}
                  system={isSystem ? 'plain' : undefined}
                >
                  {typeof m.msg === 'string' ? m.msg : JSON.stringify(m.msg)}
                </ChatBubble>
              );
            })}
            {feed.length === 0 && <p className="text-sm text-olive">Quiet table, for now.</p>}
            <div ref={endRef} />
          </div>
          <div className="flex flex-none items-center gap-2 border-t border-line px-4 py-2.5">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void submit()}
              placeholder="Say something…"
              className="min-w-0 flex-1 rounded-full border border-line bg-transparent px-3.5 py-2 text-[13px] text-cream outline-none placeholder:text-sage focus:border-gold"
            />
            <button
              onClick={() => void submit()}
              disabled={sending || !draft.trim()}
              className="h-[34px] w-[34px] flex-none rounded-full border border-[#3f4a35] bg-[rgba(216,178,90,0.14)] text-sm text-cream hover:border-gold disabled:opacity-50"
            >
              ›
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={onToggle}
          className="flex h-full w-full flex-col items-center gap-3.5 pt-4 text-sage hover:text-gold-pale"
        >
          <span className="text-sm">‹</span>
          <span className="text-[11px] uppercase tracking-[0.2em] [writing-mode:vertical-rl]">
            Table talk
          </span>
          <span className="h-1.5 w-1.5 rounded-full bg-gold" />
        </button>
      )}
    </aside>
  );
}
