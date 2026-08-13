'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  advanceChat,
  advanceGame,
  continueChat,
  humanAction,
  nextHand,
  retryLane,
  selectChatSpeakers,
  sendChatMessage,
} from '@/app/actions/play-actions';
import { getModelAccess } from '@/app/actions/user-actions';
import ModelSelect from '@/components/ModelSelect';
import { Button, CapsLabel, ChatBubble, Pill, PlayingCard, SeatPill, TableFelt } from '@/components/ui';
import { GAME_CONFIG } from '@/config/game';
import { SUPPORTED_MODELS } from '@/config/models';
import type { ActionType, HandState } from '@/lib/engine/types';
import { chatBudget, liveBots } from '@/lib/game/chat-router';
import { getModelPickerOptions, type ModelPickerOption } from '@/lib/model-access';
import type { Game, GameErrorState, Lane, GameMessage } from '@/models/game';

const AVATAR_COLORS = ['#5c8f7b', '#8d6a3f', '#a35f6d', '#4f6f8f', '#96608f', '#6f8f4f', '#8f7b4f'];
const PUMP_DELAY_MS = 600;
const BUBBLE_MS = 15_000;
const TALK_TYPES = ['TABLE_TALK', 'BOT_ANSWER', 'BOT_INTRO'];
/** Shown in the "last event" banner — the Pit Boss's picks are trace, not headline news. */
const BANNER_TYPES = ['GAME_ACTION', 'HAND_RESULT', 'COMPACTION'];
const EVENT_TYPES = [...BANNER_TYPES, 'GM_ROUTER_SELECTION'];
/** Below this the player gets told the table is running out of things to say. */
const LOW_BUDGET_WARNING = 3;
/** The rail shows only the tail of the log (events included when shown) — older talk has
 *  been absorbed into bot memory. */
const CHAT_FEED_LIMIT = 50;

function avatarColor(game: Game, name: string): string {
  const idx = game.bots.findIndex((b) => b.name === name);
  return idx >= 0 ? AVATAR_COLORS[idx % AVATAR_COLORS.length] : '#d8b25a';
}

const DESKTOP_QUERY = '(min-width: 1024px)';

/** Tracks the desktop breakpoint. The server snapshot says desktop, so SSR markup matches. */
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(DESKTOP_QUERY);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  );
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
  // Per-lane failures: the cards and the table talk stop and recover independently.
  const [gameError, setGameError] = useState<GameErrorState | null>(initialGame.gameError ?? null);
  const [chatError, setChatError] = useState<GameErrorState | null>(initialGame.chatError ?? null);
  const [acting, setActing] = useState(false);
  const isDesktop = useIsDesktop();
  // null = no explicit choice yet — the rail follows the breakpoint (auto-hidden on mobile).
  const [railPref, setRailPref] = useState<boolean | null>(null);
  const railOpen = railPref ?? isDesktop;
  const [pumpTick, setPumpTick] = useState(0);
  const [chatTick, setChatTick] = useState(0);
  const [bubbles, setBubbles] = useState<Record<string, string>>({});
  // Who is queued to speak, in order — [0] is talking now. Mirrors the server's chatQueue.
  const [chatQueue, setChatQueue] = useState<string[]>(initialGame.chatQueue.map((e) => e.actor));
  // Full-text popup for a truncated "last event" banner.
  const [eventOpen, setEventOpen] = useState(false);
  const gameRef = useRef(game);
  const inFlightRef = useRef(false);
  const chatInFlightRef = useRef(false);
  // Pump cancellation — shared refs so a StrictMode remount can revive an in-flight loop.
  const pumpCancelledRef = useRef(false);
  const chatCancelledRef = useRef(false);
  const chatRemainingRef = useRef(initialGame.chatQueue.length);
  const bubbleSeenRef = useRef(new Set(initialMessages.map((m) => m.id)));
  const bubbleTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  gameRef.current = game;

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
  //
  // The cancel flag is a shared ref, NOT an effect-local variable: StrictMode mounts run
  // effect → cleanup → effect synchronously, and with a local flag the first invocation's
  // in-flight loop would see itself cancelled, discard its result, and die while the second
  // invocation bails on the inFlight guard — leaving no pump at all. Re-arming the shared
  // ref revives the surviving loop; results are applied unconditionally (a setState after a
  // real unmount is a no-op).
  useEffect(() => {
    chatCancelledRef.current = false;
    const run = async () => {
      if (chatInFlightRef.current) return;
      chatInFlightRef.current = true;
      try {
        while (!chatCancelledRef.current && chatRemainingRef.current > 0) {
          const res = await advanceChat(gameRef.current.id);
          chatRemainingRef.current = res.queue.length;
          setChatQueue(res.queue);
          setMessages(res.messages);
          setChatError(res.chatError);
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
      chatCancelledRef.current = true;
    };
  }, [chatTick]);

  const onSendChat = useCallback(async (text: string) => {
    // Optimistic echo: the server persists the message before the Pit Boss routing call,
    // so it's safe to show immediately instead of waiting out an LLM round-trip. The
    // authoritative list from the action replaces it; a failed send takes it back.
    const echo: GameMessage = {
      id: `local-${Date.now()}`,
      recipientName: 'ALL',
      authorName: gameRef.current.humanPlayerName,
      msg: text,
      messageType: 'HUMAN_PLAYER_MESSAGE',
      handNumber: gameRef.current.handNumber,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, echo]);
    try {
      const res = await sendChatMessage(gameRef.current.id, text);
      chatRemainingRef.current = res.queue.length;
      setChatQueue(res.queue);
      setMessages(res.messages);
      setChatError(res.chatError);
      setChatTick((t) => t + 1);
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== echo.id));
      throw e; // submit() restores the draft
    }
  }, []);

  const onNudge = useCallback(async () => {
    const res = await continueChat(gameRef.current.id);
    chatRemainingRef.current = res.queue.length;
    setChatQueue(res.queue);
    setMessages(res.messages);
    setChatError(res.chatError);
    setChatTick((t) => t + 1);
  }, []);

  const onPickSpeaker = useCallback(async (name: string) => {
    const res = await selectChatSpeakers(gameRef.current.id, [name]);
    chatRemainingRef.current = res.queue.length;
    setChatQueue(res.queue);
    setMessages(res.messages);
    setChatError(res.chatError);
    setChatTick((t) => t + 1);
  }, []);

  // Game pump — one server step at a time until it's the human's turn, the between-hands
  // break (HAND_RESULTS waits for "Deal next hand"), or game over.
  // Shared cancel ref for the same StrictMode reason as the chat pump above.
  useEffect(() => {
    pumpCancelledRef.current = false;
    const run = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        while (!pumpCancelledRef.current) {
          const g = gameRef.current;
          if (isHumanTurn(g) || g.status === 'GAME_OVER') break;
          const res = await advanceGame(g.id);
          setGame(res.game);
          setChatQueue(res.game.chatQueue.map((e) => e.actor));
          setMessages(res.messages);
          setGameError(res.gameError);
          // A bot's table talk drew replies — wake the chat pump to play them out.
          if (res.chatQueued) {
            chatRemainingRef.current = res.chatQueued;
            setChatTick((t) => t + 1);
          }
          if (!res.progressed) break;
          await new Promise((r) => setTimeout(r, PUMP_DELAY_MS));
        }
      } catch (e) {
        setError(String(e instanceof Error ? e.message : e));
      } finally {
        inFlightRef.current = false;
      }
    };
    void run();
    return () => {
      pumpCancelledRef.current = true;
    };
  }, [pumpTick]);

  /**
   * Retry a stopped lane: clearing the error IS the retry. The server swaps it for a
   * one-shot hint (plus a model, if the player picked one), and waking that lane's pump
   * re-runs whatever step is still pending — the queue head is untouched, so a bot that
   * failed to speak speaks again.
   */
  const onRetry = useCallback(async (lane: Lane, model?: string) => {
    setError(null);
    await retryLane(gameRef.current.id, lane, model);
    if (lane === 'game') {
      setGameError(null);
      setPumpTick((t) => t + 1);
    } else {
      setChatError(null);
      setChatTick((t) => t + 1);
    }
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

  const onNextHand = useCallback(async () => {
    setActing(true);
    setError(null);
    try {
      const res = await nextHand(gameRef.current.id);
      setGame(res.game);
      setMessages(res.messages);
      setPumpTick((t) => t + 1);
    } catch {
      // stale click (another tab already dealt) — resync via the pump
      setPumpTick((t) => t + 1);
    } finally {
      setActing(false);
    }
  }, []);

  const myTurn = isHumanTurn(game);
  const banners = messages.filter((m) => BANNER_TYPES.includes(m.messageType));
  const lastEvent = banners[banners.length - 1];
  // Before the first deal, show the level the next hand will be played at instead of 0 · 0.
  const { smallBlind, bigBlind } =
    game.hand ?? GAME_CONFIG.blindLevels[game.blindLevel] ?? GAME_CONFIG.blindLevels[0];

  return (
    <div className="relative flex h-[calc(100dvh-3.5rem)] overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* top bar — a single line on phones: "Hand" and the blinds give way first,
            then the theme name and the thinking notice truncate */}
        <div className="flex flex-none items-center gap-2.5 border-b border-line px-3 py-3 sm:flex-wrap sm:gap-4 sm:px-6">
          <span className="min-w-0 truncate font-serif text-lg tracking-[0.01em] text-cream sm:text-xl">
            {game.theme}
          </span>
          <div className="h-4 w-px flex-none bg-line" />
          <div className="flex flex-none items-center gap-2.5 text-xs uppercase tracking-[0.08em] text-sage">
            <span>
              <span className="hidden sm:inline">Hand </span>#{game.handNumber}
            </span>
            <span className="hidden text-sage opacity-50 sm:inline">/</span>
            <span className="hidden sm:inline">
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
          {!myTurn && game.status !== 'GAME_OVER' && (
            <span className="min-w-0 truncate text-[11px] uppercase tracking-[0.2em] text-gold-pale">
              {game.hand && !game.hand.complete && game.hand.toAct
                ? `${game.hand.toAct} is thinking…`
                : game.status === 'HAND_RESULTS'
                  ? 'hand complete'
                  : 'dealing…'}
            </span>
          )}
          <Pill
            selected={railOpen}
            className="flex-none !px-2.5"
            onClick={() => setRailPref(!railOpen)}
            title={railOpen ? 'Hide table talk' : 'Show table talk'}
            aria-label={railOpen ? 'Hide table talk' : 'Show table talk'}
          >
            <span className="flex items-center gap-1">
              <svg
                width="15"
                height="15"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 8.5a1.5 1.5 0 0 1-1.5 1.5H6l-3 2.5V10h-.5A1.5 1.5 0 0 1 1 8.5v-4A1.5 1.5 0 0 1 2.5 3h8A1.5 1.5 0 0 1 12 4.5z" />
              </svg>
              <svg
                className={`transition-transform ${railOpen ? '' : 'rotate-180'}`}
                width="11"
                height="11"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 3.5L8.5 7L5 10.5" />
              </svg>
            </span>
          </Pill>
        </div>

        {/* last event banner — truncates when long; click for the full text */}
        {lastEvent && typeof lastEvent.msg === 'string' && (
          <div className="flex-none px-6 pt-3">
            <button
              key={lastEvent.id}
              onClick={() => setEventOpen(true)}
              title="Show the full event"
              className="row-in flex w-full items-center gap-3.5 rounded-2xl border border-line bg-panel px-4.5 py-3 text-left shadow-theme transition hover:border-gold-dark"
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
              <svg
                className="flex-none text-sage"
                width="13"
                height="13"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M8.5 2h3.5v3.5M12 2L7.75 6.25M5.5 12H2V8.5M2 12l4.25-4.25" />
              </svg>
            </button>
          </div>
        )}
        {eventOpen && lastEvent && typeof lastEvent.msg === 'string' && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5"
            onClick={() => setEventOpen(false)}
          >
            <div
              className="w-full max-w-lg r-md border border-line bg-panel p-5 shadow-theme"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <div className="label-caps">Last event</div>
                <div className="text-[11px] tracking-[0.1em] text-sage">
                  {fmtTime(lastEvent.timestamp)}
                </div>
              </div>
              <p className="font-serif text-xl leading-relaxed text-cream">{lastEvent.msg}</p>
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => setEventOpen(false)}
                  className="r-sm border border-line px-4 py-2 text-[13px] text-sage transition hover:border-gold hover:text-cream"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {(gameError || error) && (
          <FailureBanner lane="game" failure={gameError} fallbackMessage={error} onRetry={onRetry} />
        )}

        {/* table */}
        <div className="flex min-h-0 flex-1 items-center justify-center px-3 pb-2 pt-6 sm:px-10 sm:pt-8 xl:px-24">
          <div className="w-full max-w-[880px]">
            <PokerTable
              game={game}
              bubbles={bubbles}
              onDismissBubble={(name) => setBubbles((b) => ({ ...b, [name]: '' }))}
            />
          </div>
        </div>

        <HeroBar game={game} myTurn={myTurn} acting={acting} onAction={onHumanAction} onNextHand={onNextHand} />
      </div>

      <Rail
        game={game}
        messages={messages}
        open={railOpen}
        overlay={!isDesktop}
        queue={chatQueue}
        onToggle={() => setRailPref(!railOpen)}
        onSend={onSendChat}
        onNudge={onNudge}
        onPickSpeaker={onPickSpeaker}
        chatError={chatError}
        onRetry={onRetry}
      />
    </div>
  );
}

/**
 * A failed model call, and the two ways out of it: retry the same model (the retried
 * prompt tells it what went wrong), or spend one call on a different model without
 * changing the character's real one. There is deliberately no third option that quietly
 * carries on — a broken key or a failing model should be visible.
 */
function FailureBanner({
  lane,
  failure,
  fallbackMessage,
  onRetry,
  compact = false,
}: {
  lane: Lane;
  failure: GameErrorState | null;
  fallbackMessage: string | null;
  onRetry: (lane: Lane, model?: string) => Promise<void>;
  compact?: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const [options, setOptions] = useState<ModelPickerOption[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  useEffect(() => {
    if (!picking || options) return;
    getModelAccess()
      .then((access) => setOptions(getModelPickerOptions(access.tier)))
      .catch(() => setPickError('Could not load the model list.'));
  }, [picking, options]);

  const model = failure?.model ? SUPPORTED_MODELS.find((m) => m.id === failure.model) : undefined;

  const run = async (attempt: () => Promise<void>) => {
    setBusy(true);
    setPickError(null);
    try {
      await attempt();
      setPicking(false);
    } catch (e) {
      setPickError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  const stopped = lane === 'chat' ? 'Table talk is paused.' : 'The game is paused.';
  // Nothing queued to replay (a routing call decides who speaks, so a failed one leaves no
  // speaker): the way forward is another message or a nudge, not a retry of nothing.
  const retryable = failure ? failure.retryable : true;

  return (
    <div
      className={`panel-opaque relative z-40 flex-none rounded-xl border border-loss ${
        compact ? 'mx-4 mb-2 px-3 py-2.5' : 'mx-6 mt-3 px-4 py-3'
      }`}
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className={`text-loss ${compact ? 'text-[12px]' : 'text-sm'}`}>
            {failure?.message ?? fallbackMessage ?? 'Something went wrong.'}
          </div>
          <div className="mt-1 text-[12px] leading-snug text-sage">
            {model ? `${model.displayName} didn't come back with a usable answer. ` : ''}
            {retryable ? (
              <>
                {stopped} Retry with the same model, or spend one call on another — that
                won&apos;t change{failure?.actor ? ` ${failure.actor}'s` : ' anyone’s'} model for
                the rest of the game.
              </>
            ) : (
              'Nobody was picked to speak, so there is nothing to retry. Say something else, or nudge the table, to try again.'
            )}
          </div>
          {failure?.details && (
            <div className="mt-1 truncate text-[11px] text-sage opacity-60" title={failure.details}>
              {failure.details}
            </div>
          )}
        </div>
        {retryable && (
          <div className="flex flex-none items-center gap-2">
            <Pill onClick={() => void run(() => onRetry(lane))}>Retry</Pill>
            {failure?.actor && (
              <Pill selected={picking} onClick={() => setPicking((p) => !p)}>
                Retry with another model
              </Pill>
            )}
          </div>
        )}
      </div>

      {picking && (
        <div className="mt-3 border-t border-line pt-3">
          {pickError && <div className="mb-2 text-[12px] text-loss">{pickError}</div>}
          {options ? (
            <div className={busy ? 'pointer-events-none opacity-50' : ''}>
              <ModelSelect
                options={options}
                selected={[]}
                onChange={(ids) => ids[0] && void run(() => onRetry(lane, ids[0]))}
                mode="single"
                placeholder="Pick a model for this one call…"
              />
            </div>
          ) : (
            !pickError && <div className="text-[12px] text-sage">Loading models…</div>
          )}
        </div>
      )}
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

/**
 * One seat's table-talk popup. Lives on the felt itself (not inside the seat wrapper):
 * its left edge is clamped to the container, so no pill width or transform can push it
 * off-screen. Draggable — grab anywhere on the bubble to move it off the action; a new
 * message from the same seat remounts it (keyed by text) back at its anchor.
 *
 * The pop-in animation sits on the inner div: it animates `transform`, which would
 * otherwise fight the outer div's drag translate (and Tailwind translate utilities —
 * the `translate` property — compose with animated `transform` instead of replacing
 * it, which is what used to shift centered bubbles half a width off their seat).
 */
function SeatBubble({
  author,
  authorColor,
  left,
  top,
  text,
  onDismiss,
}: {
  author: string;
  authorColor: string;
  /** seat-center percentages within the felt */
  left: number;
  top: number;
  text: string;
  onDismiss: () => void;
}) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const below = top <= 60; // top rows speak below their seat, bottom rows above
  return (
    <div
      className="absolute z-[35] w-56 max-w-[62vw] cursor-grab touch-none select-none active:cursor-grabbing"
      style={{
        left: `clamp(0%, calc(${left}% - 7rem), calc(100% - min(14rem, 62vw)))`,
        ...(below ? { top: `calc(${top}% + 2rem)` } : { bottom: `calc(${100 - top}% + 2rem)` }),
        transform: `translate(${offset.x}px, ${offset.y}px)`,
      }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return; // let the ✕ be a click
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
      }}
      onPointerMove={(e) => {
        const d = dragRef.current;
        if (d) setOffset({ x: d.ox + e.clientX - d.px, y: d.oy + e.clientY - d.py });
      }}
      onPointerUp={() => (dragRef.current = null)}
      onPointerCancel={() => (dragRef.current = null)}
    >
      <div className="bubble-pop-edge relative w-fit max-w-full">
        <ChatBubble author={author} authorColor={authorColor}>
          {text}
        </ChatBubble>
        <button
          onClick={onDismiss}
          title="Dismiss"
          aria-label={`Dismiss ${author}'s message`}
          className="absolute -right-1.5 -top-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full border border-line bg-panel text-[10px] leading-none text-sage shadow-theme transition hover:border-gold hover:text-cream"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function PokerTable({
  game,
  bubbles,
  onDismissBubble,
}: {
  game: Game;
  bubbles: Record<string, string>;
  onDismissBubble: (name: string) => void;
}) {
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

  // Who posted the blinds: hand.players is in order starting left of the button, and
  // heads-up the button posts the small blind (mirrors startHand in the engine).
  const handPlayers = game.hand && !game.hand.complete ? game.hand.players : null;
  const headsUp = handPlayers?.length === 2;
  const sbName = handPlayers ? (headsUp ? handPlayers[1] : handPlayers[0]).name : null;
  const bbName = handPlayers ? (headsUp ? handPlayers[0] : handPlayers[1]).name : null;

  // During the between-hands pause, everyone who reached showdown has their cards on the felt.
  const lastRecord = game.handHistory[game.handHistory.length - 1];
  const showdownCards =
    game.status === 'HAND_RESULTS' && lastRecord?.handNumber === game.handNumber
      ? new Map((lastRecord.showdown ?? []).map((s) => [s.name, s.cards]))
      : null;

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
          {/* showdown reveal — cards fan out where each player's chips sat */}
          {showdownCards &&
            seats.map((seat, i) => {
              const cards = showdownCards.get(seat.name);
              if (!cards?.length) return null;
              const pos = stackPos(i);
              return (
                <div
                  key={`show-${seat.name}`}
                  className="chip-pop absolute z-[13] flex gap-1"
                  style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
                >
                  {cards.map((card) => (
                    <PlayingCard key={card} card={card} />
                  ))}
                </div>
              );
            })}
          {seats.map((seat, i) => {
            const { left, top } = seatPos(i);
            const bot = game.bots.find((b) => b.name === seat.name);
            const model = bot && SUPPORTED_MODELS.find((m) => m.id === bot.aiType);
            const player = game.hand?.players.find((p) => p.name === seat.name);
            const behind = player ? player.startingStack - player.totalCommitted : seat.stack;
            const acting = !game.hand?.complete && game.hand?.toAct === seat.name;
            return (
              <div
                key={seat.seatIndex}
                className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
                // left is clamped so edge seats stay on-screen: on narrow containers the
                // ellipse would put seat centers ~30px from the edge, hanging half the
                // pill outside the viewport.
                style={{
                  left: `clamp(3.5rem, ${left}%, calc(100% - 3.5rem))`,
                  top: `${top}%`,
                }}
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
                  blind={seat.name === sbName ? 'SB' : seat.name === bbName ? 'BB' : undefined}
                />
              </div>
            );
          })}
          {/* speech bubbles — their own felt-level layer, clamped to the container so
              they can never leave the screen, and draggable out of the way */}
          {seats.map((seat, i) => {
            const bubble = bubbles[seat.name];
            if (!bubble) return null;
            const { left, top } = seatPos(i);
            return (
              <SeatBubble
                key={`${seat.seatIndex}:${bubble}`}
                author={seat.name}
                authorColor={avatarColor(game, seat.name)}
                left={left}
                top={top}
                text={bubble}
                onDismiss={() => onDismissBubble(seat.name)}
              />
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
  onNextHand,
}: {
  game: Game;
  myTurn: boolean;
  acting: boolean;
  onAction: (type: ActionType, amount?: number) => void;
  onNextHand: () => void;
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
    // z-40: the bottom seats hang below the felt (z-20/z-35 with theme tilts) and would
    // otherwise paint over the raise sizer and swallow clicks on its preset pills.
    <div className="relative z-40 flex-none px-3 pb-4 sm:px-6 sm:pb-5">
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
      {/* narrow screens: the stack rides above so cards and buttons share one row */}
      <div className="mb-1 text-sm tabular-nums text-gold sm:hidden">
        {(me.startingStack - me.totalCommitted).toLocaleString()}
      </div>
      {/* overflow-x-auto: worst-case (big call amounts on a tiny screen) scrolls, never wraps */}
      <div className="flex flex-nowrap items-center gap-2.5 overflow-x-auto sm:gap-3.5">
        <div className="flex items-center gap-2.5">
          <CapsLabel className="hidden sm:block">Your hand</CapsLabel>
          <div className="flex gap-2">
            {(me.holeCards ?? []).map((card) => (
              <PlayingCard key={card} card={card} />
            ))}
          </div>
          <div className="ml-1 hidden sm:block">
            <div className="font-serif text-lg leading-tight text-cream">{game.humanPlayerName}</div>
            <div className="text-sm tabular-nums text-gold">
              {(me.startingStack - me.totalCommitted).toLocaleString()}
            </div>
          </div>
        </div>
        <div className="flex-1" />
        {/* Between hands the table lingers on the result until the player deals. */}
        {game.status === 'HAND_RESULTS' && (
          <Button
            variant="gold"
            size="lg"
            onClick={onNextHand}
            disabled={acting}
            className="uppercase tracking-[0.08em]"
          >
            {acting ? 'Dealing…' : 'Deal next hand'}
          </Button>
        )}
        {/* Always visible while a hand runs — disabled until it's your turn, so the game
            controls have a fixed home and the wait state is spelled out next to them. */}
        {legal && !me.folded && (
          <div className="flex flex-nowrap items-center gap-1.5 sm:gap-2.5">
            {/* narrow screens rely on the top bar's "X is thinking…" instead */}
            {!myTurn && (
              <span className="mr-1 hidden text-[11px] uppercase tracking-[0.18em] text-sage sm:inline">
                {hand.toAct ? `Waiting for ${hand.toAct}…` : 'dealing…'}
              </span>
            )}
            <Button
              variant="dark"
              size="lg"
              disabled={acting || !myTurn}
              onClick={() => onAction('fold')}
              className="uppercase tracking-[0.08em]"
            >
              Fold
            </Button>
            <Button
              variant="moss"
              size="lg"
              disabled={acting || !myTurn}
              onClick={() => onAction(legal.callAmount ? 'call' : 'check')}
              className="uppercase tracking-[0.08em]"
            >
              {legal.callAmount ? `Call ${legal.callAmount.toLocaleString()}` : 'Check'}
            </Button>
            {legal.canRaise && (
              <Button
                variant="gold"
                size="lg"
                disabled={acting || !myTurn}
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
        {legal && me.folded && (
          <span className="text-[11px] uppercase tracking-[0.18em] text-sage-dim">
            You folded — watching the hand play out
          </span>
        )}
      </div>
    </div>
  );
}

function Rail({
  game,
  messages,
  open,
  overlay,
  queue,
  onToggle,
  onSend,
  onNudge,
  onPickSpeaker,
  chatError,
  onRetry,
}: {
  game: Game;
  messages: GameMessage[];
  open: boolean;
  /** Narrow screens: float over the table instead of squeezing it, and vanish when closed. */
  overlay: boolean;
  /** Speakers still queued, in order — [0] is talking now. */
  queue: string[];
  onToggle: () => void;
  onSend: (text: string) => Promise<void>;
  onNudge: () => Promise<void>;
  onPickSpeaker: (name: string) => Promise<void>;
  chatError: GameErrorState | null;
  onRetry: (lane: Lane, model?: string) => Promise<void>;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [eventsShown, setEventsShown] = useState(true);
  const [prodding, setProdding] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);

  // While speakers are queued, the mic is theirs: no new message or nudge until it drains.
  const queueBusy = queue.length > 0;

  // Same budget the server enforces, computed from the same message log.
  const budget = chatBudget(game, messages);
  const spent = budget.remaining === 0;
  const speakers = liveBots(game);

  // A failure with nothing queued leaves these controls live — they are the way out of it.
  const chatStalled = chatError?.retryable === true;

  const prod = async (run: () => Promise<void>) => {
    if (prodding || spent || chatStalled || queueBusy) return;
    setProdding(true);
    try {
      await run();
    } finally {
      setProdding(false);
    }
  };

  const feed = messages
    .filter(
      (m) =>
        (m.recipientName === 'ALL' || m.recipientName === game.humanPlayerName) &&
        (eventsShown || !EVENT_TYPES.includes(m.messageType)),
    )
    .slice(-CHAT_FEED_LIMIT);
  const eventCount = messages.filter((m) => EVENT_TYPES.includes(m.messageType)).length;

  // Keyed on the last id, not length — a capped feed keeps a constant length.
  // Opening the rail jumps straight to the newest message (the feed remounts at the
  // top when closed); the smooth glide is only for new talk while it's already open.
  const lastFeedId = feed[feed.length - 1]?.id;
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    endRef.current?.scrollIntoView({
      behavior: wasOpenRef.current ? 'smooth' : 'instant',
      block: 'nearest',
    });
    wasOpenRef.current = true;
  }, [lastFeedId, open]);

  const submit = async () => {
    const text = draft.trim();
    if (!text || sending || chatStalled || queueBusy) return;
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
      className={`flex-none overflow-hidden border-l border-line bg-page transition-[width] duration-300 ${
        overlay ? 'absolute inset-y-0 right-0 z-40 shadow-theme' : ''
      }`}
      style={{ width: open ? 'min(320px, 88vw)' : overlay ? 0 : 52 }}
    >
      {open ? (
        <div className="flex h-full w-[min(320px,88vw)] flex-col">
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
          {/* who has the mic — click for the whole line */}
          {queueBusy && (
            <div className="flex-none px-4.5 pb-2.5">
              <button
                onClick={() => setQueueOpen((o) => !o)}
                className="flex w-full items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2 text-left transition hover:border-gold-dark"
              >
                <span className="h-2 w-2 flex-none animate-pulse rounded-full bg-gold" />
                <span className="min-w-0 truncate text-[12px] text-cream">
                  {queue[0]} is talking…
                </span>
                <span className="flex-1" />
                {queue.length > 1 && (
                  <span className="flex-none text-[11px] tabular-nums text-sage">
                    +{queue.length - 1} in line
                  </span>
                )}
                <svg
                  className={`flex-none text-sage transition-transform ${queueOpen ? 'rotate-180' : ''}`}
                  width="12"
                  height="12"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <path d="M3.5 5.25L7 8.75L10.5 5.25" />
                </svg>
              </button>
              {queueOpen && (
                <ol className="mt-1.5 flex flex-col gap-1.5 rounded-xl border border-line bg-panel px-3 py-2.5">
                  {queue.map((name, i) => (
                    <li key={`${name}-${i}`} className="flex items-center gap-2 text-[12px]">
                      <span className="w-4 flex-none text-right tabular-nums text-sage opacity-60">
                        {i + 1}.
                      </span>
                      <span
                        className="h-1.5 w-1.5 flex-none rounded-full"
                        style={{ background: avatarColor(game, name) }}
                      />
                      <span className={i === 0 ? 'text-cream' : 'text-sage'}>{name}</span>
                      {i === 0 && (
                        <span className="text-[9px] uppercase tracking-[0.2em] text-gold">
                          talking
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
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
          {chatError && (
            <FailureBanner
              lane="chat"
              failure={chatError}
              fallbackMessage={null}
              onRetry={onRetry}
              compact
            />
          )}
          {/* hand the mic: nudge the whole table, or call on one character */}
          <div className="flex flex-none flex-wrap items-center gap-1.5 border-t border-line px-4 pt-2.5">
            {chatStalled ? null : spent ? (
              <span className="text-[11px] leading-snug text-sage opacity-70">
                {budget.gameExhausted
                  ? 'The table has talked itself out for this game.'
                  : 'The table has said its piece this hand — deal on.'}
              </span>
            ) : (
              <>
                <button
                  onClick={() => void prod(onNudge)}
                  disabled={prodding || queueBusy}
                  className="rounded-full border border-line px-2.5 py-1 text-[11px] text-sage hover:border-gold-dark hover:text-gold-pale disabled:opacity-40 disabled:hover:border-line disabled:hover:text-sage"
                >
                  Nudge table
                </button>
                {speakers.map((b) => (
                  <button
                    key={b.name}
                    onClick={() => void prod(() => onPickSpeaker(b.name))}
                    disabled={prodding || queueBusy}
                    title={queueBusy ? 'The table is talking…' : `Ask ${b.name} to speak`}
                    className="flex items-center gap-1.5 rounded-full border border-line px-2 py-1 text-[11px] text-sage hover:border-gold-dark hover:text-gold-pale disabled:opacity-40 disabled:hover:border-line disabled:hover:text-sage"
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: avatarColor(game, b.name) }}
                    />
                    {b.name}
                  </button>
                ))}
                {budget.remaining <= LOW_BUDGET_WARNING && (
                  <span className="text-[10px] uppercase tracking-[0.14em] text-sage opacity-60">
                    {budget.remaining} left
                  </span>
                )}
              </>
            )}
          </div>
          <div className="flex flex-none items-center gap-2 px-4 pb-2.5 pt-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void submit()}
              disabled={queueBusy}
              placeholder={
                chatStalled
                  ? 'Retry the stalled reply first…'
                  : queueBusy
                    ? `${queue[0]} is talking…`
                    : spent
                      ? 'The table is done talking…'
                      : 'Say something…'
              }
              className="min-w-0 flex-1 rounded-full border border-line bg-transparent px-3.5 py-2 text-[13px] text-cream outline-none placeholder:text-sage focus:border-gold disabled:opacity-50"
            />
            <button
              onClick={() => void submit()}
              disabled={sending || chatStalled || queueBusy || !draft.trim()}
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
