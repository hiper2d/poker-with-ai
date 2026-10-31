/**
 * Content-screen records and the mode switch. Server-only.
 *
 * Every non-skipped screen call writes one row to `poker_screenCalls` (180-day `expireAt` —
 * a TTL policy on that field has to be enabled once in the Firestore console). The rows are
 * the only full copy of the screened text: logs carry the verdict, never the text.
 *
 * The mode is the `pokerScreenMode` field of the shared `config/limits` doc ('off' |
 * 'monitor' | 'enforce', default monitor), cached for a minute so it can be flipped without
 * a deploy. Werewolf's own switch on the same doc is `jevScreenMode`; the two games roll out
 * independently.
 */
import { COLLECTIONS, db, stripUndefined } from '@/lib/firebase/server';
import { logger } from '@/lib/logging/logger';

export type ScreenSource = 'chat' | 'preview';
export type ScreenVerdict = 'ok' | 'grey' | 'would_block' | 'error';
export type ScreenMode = 'off' | 'monitor' | 'enforce';

export const DEFAULT_SCREEN_MODE: ScreenMode = 'monitor';
const RECORD_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const MODE_CACHE_TTL_MS = 60_000;

/** One judge's answer (or failure) — the row's own fields for the deciding judge, `shadow` for the other. */
export interface ScreenJudgement {
  model: string;
  verdict: ScreenVerdict;
  /** On would_block the hard flag that tripped; on a high-risk grey the strongest flag or 'score'. */
  reason: string | null;
  riskScore: number | null;
  /** Probability mass on the top two risk levels. */
  highRisk: number | null;
  flags: Record<string, number> | null;
  answers?: Record<string, unknown>;
  inputTokens?: number;
  costUSD?: number;
  durationMs?: number;
  error?: string;
  httpStatus?: number;
}

export interface ScreenCallRecord extends ScreenJudgement {
  /** null for a preview: the game does not exist yet. */
  gameId: string | null;
  userEmail: string;
  source: ScreenSource;
  handNumber: number | null;
  /** The human text as screened. */
  text: string;
  state: Record<string, unknown>;
  questions: Record<string, unknown>;
  promptVersion: string;
  /** The config in force when the verdict was made. */
  thresholds: Record<string, unknown>;
  mode: 'monitor' | 'enforce';
  /** True only when the input was actually rejected (enforce mode, would_block). */
  enforced: boolean;
  /** The other judge's answer to the same input — recorded, never acted on. */
  shadow?: ScreenJudgement;
}

/** Best-effort: a lost record must never fail the player's action. */
export async function saveScreenCall(record: ScreenCallRecord): Promise<void> {
  const now = Date.now();
  try {
    await db.collection(COLLECTIONS.screenCalls).add(
      stripUndefined({ ...record, createdAt: now, expireAt: new Date(now + RECORD_TTL_MS) }),
    );
  } catch (error) {
    logger.warn('screen record not saved', { gameId: record.gameId, source: record.source, error: String(error) });
  }
}

export function screenModeFromConfig(data: Record<string, unknown> | undefined | null): ScreenMode {
  const value = data?.pokerScreenMode;
  return value === 'off' || value === 'monitor' || value === 'enforce' ? value : DEFAULT_SCREEN_MODE;
}

let modeCache: { mode: ScreenMode; expiresAt: number } | null = null;

export async function getScreenMode(): Promise<ScreenMode> {
  const now = Date.now();
  if (modeCache && modeCache.expiresAt > now) return modeCache.mode;
  let mode = DEFAULT_SCREEN_MODE;
  try {
    const snapshot = await db.collection(COLLECTIONS.config).doc('limits').get();
    mode = screenModeFromConfig(snapshot.data());
  } catch (error) {
    logger.warn('config/limits unreadable — screen runs in the default mode', { error: String(error) });
  }
  modeCache = { mode, expiresAt: now + MODE_CACHE_TTL_MS };
  return mode;
}
