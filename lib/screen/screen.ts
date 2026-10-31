/**
 * Content screen for human input. Server-only. Ported from werewolf (app/api/jev-screen.ts).
 *
 * Every AI call in the game goes out on platform keys, and a provider that keeps seeing content
 * it labels prohibited flags the ACCOUNT — the one werewolf shares. This runs before the first
 * hit: what a human types (a table-talk message, a new game's name and theme) is judged in one
 * ~200 ms call and the verdict is recorded. In `monitor` mode (the default) that is all; in
 * `enforce` mode a would-block verdict rejects the input before it is saved or reaches any
 * provider. The switch: `pokerScreenMode` on config/limits (lib/screen/records.ts).
 *
 * Bot output is never screened: refusing a bot turn only creates a stuck game.
 *
 * Two judges, asked at once: Jev (typesafe.ai) decides, OpenAI Decisions decides when Jev errors
 * or times out, and otherwise its answer is recorded as the shadow. Fails open only when both
 * fail: the input goes through (logged, recorded) — provider filters stay as the backstop, and
 * screening never makes a game stuck. `screenHumanInput` never throws.
 *
 * Where text reaches an image prompt (the setup's art style, the cast's appearances) werewolf's two
 * picture questions are asked too. They never reject text: past the bar the caller sets the art
 * style or the appearances aside, in monitor mode as well — that only steers prompts away from a
 * draw Gemini would refuse.
 */
import type { TokenUsage } from '@hiper2d/ai-agents';
import { chargeUsageOutsideGame, recordScreenUsage } from '@/lib/cost-tracking';
import { logger } from '@/lib/logging/logger';
import {
  askJev,
  getJevApiKey,
  JEV_API_KEY_NAME,
  JEV_MODEL,
  type JevNoulQuestion,
  type JevResult,
  type JevScoreQuestion,
  type ScreenApiKeys,
} from '@/lib/screen/jev-client';
import {
  askOpenAiDecisions,
  OPENAI_DECISIONS_API_KEY_NAME,
  OPENAI_DECISIONS_MODEL,
} from '@/lib/screen/openai-decisions-client';
import {
  SCREEN_CONTEXT_ART_STYLE,
  SCREEN_CONTEXT_CAST,
  SCREEN_CONTEXT_CHAT,
  SCREEN_CONTEXT_PREVIEW,
  SCREEN_IMAGE_PERSON_QUESTION,
  SCREEN_IMAGE_QUESTION,
  SCREEN_FLAG_QUESTIONS,
  SCREEN_PROMPT_VERSION,
  SCREEN_RISK_LEVELS,
  SCREEN_RISK_QUESTION,
  type ScreenFlag,
} from '@/lib/screen/prompts';
import {
  getScreenMode,
  saveScreenCall,
  type ScreenJudgement,
  type ScreenMode,
  type ScreenSource,
  type ScreenVerdict,
} from '@/lib/screen/records';
import type { Game } from '@/models/game';
import type { UserTier } from '@/models/user';

/** Werewolf's tuned thresholds, unchanged — the rationale and probe numbers live in its jev-screen.ts. */
export const SCREEN_CONFIG = {
  /**
   * Would-block comes from these flags alone. The 0–3 score never blocks: it is a monitoring
   * signal. Kept to what providers act on at the account level — sexualized minors, real-world
   * harm, a sexualized real person. The bar is high on purpose.
   */
  HARD_FLAGS: { minors: 0.9, real_harm: 0.9, real_person_sexual: 0.9 } as Partial<Record<ScreenFlag, number>>,
  /** Grey with a reason when the mass on the top two risk levels reaches this — the rows to read by hand. */
  HIGH_RISK_PROBABILITY: 0.6,
  /** Grey zone starts here on the 0–3 score: recorded, never rejected. */
  GREY_SCORE: 1.2,
  /** Past this a judge is stalled and the human would be waiting on it (werewolf p99 ≈ 314 ms). */
  TIMEOUT_MS: 3_000,
  DECISIONS_TIMEOUT_MS: 3_000,
  /** Either picture question at or above this sets the art style / appearances aside. */
  IMAGE_REFUSAL_PROBABILITY: 0.6,
} as const;

export type ScreenQuestions = {
  risk: JevScoreQuestion;
  image?: JevNoulQuestion;
  image_person?: JevNoulQuestion;
} & Record<ScreenFlag, JevNoulQuestion>;

export interface ScreenDecision {
  verdict: Exclude<ScreenVerdict, 'error'>;
  reason: string | null;
  riskScore: number;
  highRisk: number;
  flags: Record<ScreenFlag, number>;
  /** The picture questions' probabilities; null when not asked. Outside the verdict. */
  imageRefusal: number | null;
  imagePerson: number | null;
}

export interface ScreenInput {
  source: ScreenSource;
  text: string;
  userEmail: string;
  apiKeys: ScreenApiKeys;
  /** Billing target: the game when one exists, else the user's tier (a preview). */
  game?: Game;
  tier?: UserTier;
}

export interface ScreenOutcome {
  /** 'skipped' when no judge key is configured, the mode is off, or the text is empty. */
  verdict: ScreenVerdict | 'skipped';
  reason: string | null;
  mode: ScreenMode;
  /** True only in enforce mode on a would-block verdict: the caller must not save or send the text. */
  blocked: boolean;
  /** What to show the player when blocked. */
  message?: string;
  /** The deciding judge put a picture question past the bar: drop the text from image prompts.
   * False when not asked, skipped or failed. */
  imageUnsafe: boolean;
}

/** Shown under the art style field when the setup's style was set aside. */
export const ART_STYLE_SET_ASIDE_MESSAGE =
  'Your art style was set aside: the image model would refuse to draw it. Portraits and scenes will follow the theme instead.';

interface ScreenJudge {
  label: string;
  model: string;
  apiKeyName: string;
  timeoutMs: number;
  ask(apiKey: string, state: Record<string, unknown>, questions: ScreenQuestions, options: { timeoutMs: number }): Promise<JevResult<ScreenQuestions>>;
}

const JEV_JUDGE: ScreenJudge = {
  label: 'Jev', model: JEV_MODEL, apiKeyName: JEV_API_KEY_NAME, timeoutMs: SCREEN_CONFIG.TIMEOUT_MS,
  ask: (apiKey, state, questions, options) => askJev(apiKey, state, questions, options),
};

const DECISIONS_JUDGE: ScreenJudge = {
  label: 'OpenAI Decisions', model: OPENAI_DECISIONS_MODEL, apiKeyName: OPENAI_DECISIONS_API_KEY_NAME,
  timeoutMs: SCREEN_CONFIG.DECISIONS_TIMEOUT_MS,
  ask: (apiKey, state, questions, options) => askOpenAiDecisions(apiKey, state, questions, options),
};

interface ScreenAttempt {
  judge: ScreenJudge;
  result?: JevResult<ScreenQuestions>;
  error?: string;
  status?: number;
}

const FLAG_NAMES = Object.keys(SCREEN_FLAG_QUESTIONS) as ScreenFlag[];
const TOP_LEVELS = [SCREEN_RISK_LEVELS.length - 2, SCREEN_RISK_LEVELS.length - 1].map(String);

const CONTEXT_BY_SOURCE: Record<ScreenSource, string> = {
  chat: SCREEN_CONTEXT_CHAT,
  preview: SCREEN_CONTEXT_PREVIEW,
  art_style: SCREEN_CONTEXT_ART_STYLE,
  cast: SCREEN_CONTEXT_CAST,
};

/** Sources whose text reaches an image prompt, so the picture questions are asked alongside. */
const IMAGE_SOURCES: ReadonlySet<ScreenSource> = new Set(['preview', 'art_style', 'cast']);

/** What a rejection message calls the input. */
const WHAT_BY_SOURCE: Record<ScreenSource, string> = {
  chat: 'This message',
  preview: 'This game setup',
  art_style: 'This art style',
  cast: 'This cast',
};

/** The judges with a key, in order of precedence: the first that answers decides. */
function screenJudges(apiKeys: ScreenApiKeys): Array<{ judge: ScreenJudge; apiKey: string }> {
  const judges: Array<{ judge: ScreenJudge; apiKey: string }> = [];
  const jevKey = getJevApiKey(apiKeys);
  if (jevKey) judges.push({ judge: JEV_JUDGE, apiKey: jevKey });
  const openAiKey = apiKeys?.[OPENAI_DECISIONS_API_KEY_NAME];
  if (typeof openAiKey === 'string' && openAiKey.trim()) judges.push({ judge: DECISIONS_JUDGE, apiKey: openAiKey.trim() });
  return judges;
}

export function buildScreenRequest(source: ScreenSource, text: string): { state: Record<string, unknown>; questions: ScreenQuestions } {
  const state = { context: CONTEXT_BY_SOURCE[source], text };
  const questions = {
    risk: { type: 'score', instructions: SCREEN_RISK_QUESTION, criteria: [...SCREEN_RISK_LEVELS] },
    ...Object.fromEntries(FLAG_NAMES.map((flag) => [flag, { type: 'noul', instructions: SCREEN_FLAG_QUESTIONS[flag] }])),
    ...(IMAGE_SOURCES.has(source)
      ? {
          image: { type: 'noul', instructions: SCREEN_IMAGE_QUESTION },
          image_person: { type: 'noul', instructions: SCREEN_IMAGE_PERSON_QUESTION },
        }
      : {}),
  } as ScreenQuestions;
  return { state, questions };
}

/** Pure: raw judge answers + config → verdict. Replayable on recorded rows. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function decideScreen(answers: Record<string, any>, config = SCREEN_CONFIG): ScreenDecision {
  const risk = answers?.risk ?? {};
  const riskScore = Number(risk.score) || 0;
  const highRisk = TOP_LEVELS.reduce((sum, level) => sum + (Number(risk.probabilities?.[level]) || 0), 0);
  const flags = Object.fromEntries(FLAG_NAMES.map((flag) => [flag, Number(answers?.[flag]?.noul) || 0])) as Record<ScreenFlag, number>;
  const probability = (q: string) => (answers?.[q]?.noul === undefined ? null : Number(answers[q].noul) || 0);
  const scores = { riskScore, highRisk, flags, imageRefusal: probability('image'), imagePerson: probability('image_person') };

  // A hard flag names the reason even when the score agrees, so the message to the player is specific.
  for (const [flag, threshold] of Object.entries(config.HARD_FLAGS) as [ScreenFlag, number][]) {
    if (flags[flag] >= threshold) return { verdict: 'would_block', reason: flag, ...scores };
  }
  if (highRisk >= config.HIGH_RISK_PROBABILITY) {
    const strongest = FLAG_NAMES.reduce((best, flag) => (flags[flag] > flags[best] ? flag : best), FLAG_NAMES[0]);
    return { verdict: 'grey', reason: flags[strongest] >= 0.5 ? strongest : 'score', ...scores };
  }
  if (riskScore >= config.GREY_SCORE) return { verdict: 'grey', reason: null, ...scores };
  return { verdict: 'ok', reason: null, ...scores };
}

/** Pure: is either picture question past the bar (nudity, or a sexualized real person)? */
export function isImageUnsafe(decision: Pick<ScreenDecision, 'imageRefusal' | 'imagePerson'>, config = SCREEN_CONFIG): boolean {
  const past = (p: number | null) => p !== null && p >= config.IMAGE_REFUSAL_PROBABILITY;
  return past(decision.imageRefusal) || past(decision.imagePerson);
}

/** What the player reads when the input is rejected. Names the category, never the score. */
export function screenRejectionMessage(source: ScreenSource, reason: string | null): string {
  const because: Record<string, string> = {
    sexual: 'it contains sexual content',
    minors: 'it sexualizes a minor',
    hate: 'it contains hate speech',
    real_harm: 'it describes real-world harm',
    real_person_sexual: 'it sexualizes a real person',
    jailbreak: 'it tries to override the AI players\' instructions',
  };
  const why = reason && because[reason] ? ` because ${because[reason]}` : '';
  return `${WHAT_BY_SOURCE[source]} can't be sent to the AI players${why}. Please rephrase it.`;
}

function toJudgement(attempt: ScreenAttempt): ScreenJudgement {
  if (!attempt.result) {
    return {
      model: attempt.judge.model, verdict: 'error', reason: null, riskScore: null, highRisk: null, flags: null,
      error: attempt.error, httpStatus: attempt.status,
    };
  }
  const decision = decideScreen(attempt.result.answers);
  return {
    model: attempt.result.model, verdict: decision.verdict, reason: decision.reason,
    riskScore: decision.riskScore, highRisk: decision.highRisk, flags: decision.flags,
    imageRefusal: decision.imageRefusal, imagePerson: decision.imagePerson,
    answers: attempt.result.answers as Record<string, unknown>, inputTokens: attempt.result.inputTokens,
    costUSD: attempt.result.costUSD, durationMs: attempt.result.durationMs,
  };
}

/** Bill one judge call. Never throws: a billing failure (an empty paid balance) must not break the screen. */
async function billJudge(input: ScreenInput, attempt: ScreenAttempt): Promise<void> {
  const result = attempt.result!;
  const usage: TokenUsage = {
    inputTokens: result.inputTokens, outputTokens: 0, totalTokens: result.inputTokens,
    costUSD: result.costUSD, durationMs: result.durationMs,
  };
  try {
    if (input.game) await recordScreenUsage(input.game, result.model, attempt.judge.apiKeyName, usage);
    else if (input.tier) await chargeUsageOutsideGame(input.userEmail, input.tier, usage.costUSD);
  } catch (error) {
    logger.warn('screen call not billed', { gameId: input.game?.id, source: input.source, error: String(error) });
  }
}

/**
 * Screen one piece of human text. Never throws: every failure path returns `blocked: false`.
 * Skips entirely (no call, no record) without a judge key, when the mode is `off`, or on empty text.
 */
export async function screenHumanInput(input: ScreenInput): Promise<ScreenOutcome> {
  const skipped = (mode: ScreenMode): ScreenOutcome => ({ verdict: 'skipped', reason: null, mode, blocked: false, imageUnsafe: false });
  const judges = screenJudges(input.apiKeys);
  if (judges.length === 0) return skipped('off');
  const mode = await getScreenMode();
  if (mode === 'off') return skipped(mode);
  const text = input.text.trim();
  if (!text) return skipped(mode);

  const { state, questions } = buildScreenRequest(input.source, text);
  const base = {
    gameId: input.game?.id ?? null,
    userEmail: input.userEmail,
    source: input.source,
    handNumber: input.game?.handNumber ?? null,
    text,
    state,
    questions: questions as unknown as Record<string, unknown>,
    promptVersion: SCREEN_PROMPT_VERSION,
    thresholds: SCREEN_CONFIG as unknown as Record<string, unknown>,
    mode,
  };
  const log = logger.with({ gameId: input.game?.id, user: input.userEmail, activity: 'content_screen', source: input.source });

  // Both judges at once: the wait is the slower of the two rather than their sum when Jev
  // fails, and every input gets a paired verdict to compare the judges on.
  const attempts: ScreenAttempt[] = await Promise.all(
    judges.map(async ({ judge, apiKey }): Promise<ScreenAttempt> => {
      try {
        return { judge, result: await judge.ask(apiKey, state, questions, { timeoutMs: judge.timeoutMs }) };
      } catch (error) {
        const e = error as { message?: string; status?: unknown; body?: string };
        return {
          judge,
          error: `${e?.message ?? error}${e?.body ? `: ${e.body}` : ''}`,
          status: typeof e?.status === 'number' ? e.status : undefined,
        };
      }
    }),
  );
  const deciding = attempts.find((attempt) => attempt.result);
  const shadowAttempt = attempts.find((attempt) => attempt !== (deciding ?? attempts[0]));

  for (const attempt of attempts) {
    if (attempt.result) {
      await billJudge(input, attempt);
      continue;
    }
    // `warn` for the backup judge when the primary decided (its answer is only the shadow).
    const shadowOnly = deciding === attempts[0] && attempt !== attempts[0];
    log[shadowOnly ? 'warn' : 'error'](`${attempt.judge.label} screen request failed${shadowOnly ? ' (shadow)' : ''}`, {
      model: attempt.judge.model, error: attempt.error, status: attempt.status,
      fallback: deciding ? `${deciding.judge.label} decided` : 'let through',
    });
  }
  const shadow = shadowAttempt ? toJudgement(shadowAttempt) : undefined;

  if (!deciding?.result) {
    await saveScreenCall({ ...base, ...toJudgement(attempts[0]), enforced: false, shadow });
    return { verdict: 'error', reason: null, mode, blocked: false, imageUnsafe: false };
  }

  const decision = decideScreen(deciding.result.answers);
  const blocked = mode === 'enforce' && decision.verdict === 'would_block';
  const imageUnsafe = isImageUnsafe(decision);
  await saveScreenCall({ ...base, ...toJudgement(deciding), enforced: blocked, shadow });
  log[decision.verdict === 'would_block' || imageUnsafe ? 'warn' : 'info'](
    `content screen ${decision.verdict}${blocked ? ' (rejected)' : ''}${imageUnsafe ? ' (image text set aside)' : ''}`, {
    mode, model: deciding.result.model, verdict: decision.verdict, reason: decision.reason,
    riskScore: decision.riskScore, highRisk: decision.highRisk, durationMs: deciding.result.durationMs,
    imageRefusal: decision.imageRefusal, imagePerson: decision.imagePerson,
    ...(shadow ? { shadowVerdict: shadow.verdict } : {}),
  });

  return {
    verdict: decision.verdict,
    reason: decision.reason,
    mode,
    blocked,
    ...(blocked ? { message: screenRejectionMessage(input.source, decision.reason) } : {}),
    imageUnsafe,
  };
}

/**
 * Screens an art style on its own where it enters an image prompt after the preview judged the
 * setup: createGame takes the field as the player last typed it, which may not be what the
 * preview saw. `unsafe: false` without a call when there is no style, and on a skipped or
 * failed call.
 */
export async function screenArtStyle(input: {
  theme: string;
  artStyle: string | undefined;
  userEmail: string;
  apiKeys: ScreenApiKeys;
  tier: UserTier;
}): Promise<{ unsafe: boolean }> {
  if (!input.artStyle) return { unsafe: false };
  const outcome = await screenHumanInput({
    source: 'art_style',
    text: `Theme: ${input.theme.trim()}\nArt style: ${input.artStyle}`,
    userEmail: input.userEmail,
    apiKeys: input.apiKeys,
    tier: input.tier,
  });
  return { unsafe: outcome.imageUnsafe };
}

/**
 * Screens the cast as the player submits it to createGame: the scene and every character's
 * name, story and appearance are editable on the preview after it was judged, the stories sit
 * in every bot prompt, and the appearances go verbatim into the portrait prompt. One call over
 * the whole cast. A cast past the picture bar has its appearances set aside by the caller.
 */
export async function screenCast(input: {
  scene: string;
  characters: { name: string; story: string; visualDescription?: string }[];
  userEmail: string;
  apiKeys: ScreenApiKeys;
  tier: UserTier;
}): Promise<ScreenOutcome> {
  const blocks = [
    `Opening scene: ${input.scene.trim()}`,
    ...input.characters.map((c) =>
      [
        `Character ${c.name.trim()}`,
        `Backstory: ${c.story.trim()}`,
        ...(c.visualDescription?.trim() ? [`Appearance: ${c.visualDescription.trim()}`] : []),
      ].join('\n'),
    ),
  ];
  return screenHumanInput({
    source: 'cast',
    text: blocks.join('\n\n'),
    userEmail: input.userEmail,
    apiKeys: input.apiKeys,
    tier: input.tier,
  });
}
