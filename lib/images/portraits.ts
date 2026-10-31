/**
 * Portraits and the welcome scene. Server-only. Ported from werewolf
 * (app/utils/avatar-generation.ts), on the library's one-call pipeline.
 *
 * The portrait pipeline itself — grid layout, sheet prompt, divider detection, card cutting —
 * is `drawPortraitSheet` from @hiper2d/ai-agents/images. This file supplies poker's subject
 * (who sits at the table and how each character looks), the scene, and everything Firestore:
 *
 * - Images are base64 JPEG docs in `poker_games/{id}/poker_images/{key}` (no Storage bucket),
 *   served by app/api/games/[id]/images/[key]. Each doc carries the game's `expireAt`, so the
 *   `poker_images` TTL policy deletes them with the table.
 * - Keys: `p{seatIndex}` per seat (names can collide once sanitized; seat indexes cannot),
 *   `dealer` for the GM, `scene-welcome`, and `sheet-0` — the whole sheet, kept so a card
 *   can be re-cut at a new framing later.
 * - Game state lives in `game.images` (models/game.ts). The draw runs beside the game pump,
 *   so it writes with dotted-path updates and saveGame never writes `images` back.
 *
 * Pictures are decorative: a failed or refused draw marks the game `failed`, logs, records
 * the spend already incurred, and the table keeps its initials.
 */
import { API_KEY_CONSTANTS } from '@hiper2d/ai-agents';
import {
  circleFocus,
  drawPortraitSheet,
  focusToBackground,
  generateImage,
  isImageRefusalError,
  type DrawnSheet,
  type PortraitCell,
  type PortraitSlice,
} from '@hiper2d/ai-agents/images';
import { getApiKeysForUser } from '@/lib/api-keys';
import { recordImageUsage } from '@/lib/cost-tracking';
import { COLLECTIONS, db } from '@/lib/firebase/server';
import { expiryDate } from '@/lib/game/ttl';
import { sanitizeArtStyle } from '@/lib/images/art-style';
import { logger } from '@/lib/logging/logger';
import type { Game, ImageRefusal, PortraitEntry } from '@/models/game';

import { DEALER_KEY, SCENE_WELCOME_KEY, SHEET_KEY, seatKey } from '@/lib/images/view';

/** Nano Banana 2.1 thinks before drawing; `minimal` drew the same sheet in half the time and cost. */
const THINKING_LEVEL = 'minimal' as const;
/** A claim older than this is a crashed draw — the next visit may take the game over. */
export const STALE_CLAIM_MS = 5 * 60 * 1000;
/** Firestore caps a request near 10 MB and each doc near 1 MiB; a portrait is ~60-90 KB of base64. */
const DOC_BATCH = 8;

const log = logger.with({ activity: 'images' });

/** Stories are narrative, not visual: one sentence is plenty for the painter (werewolf: the full
 * story made the model typeset it into the image as a bio column). Legacy fallback only. */
function firstSentence(text: string): string {
  const m = text.match(/^.{0,180}?[.!?](?=\s|$)/);
  return m ? m[0] : text.slice(0, 180);
}

/**
 * The cast in seat order, then the dealer. No character names in the prompt: probed live
 * 2026-10-31, a Pirates of the Caribbean cast was refused ("prohibited content") whenever the
 * cells carried the canonical names, even with neutral looks, and also when nameless cells
 * described the films' iconic looks — both point the model at the actors. Nameless cells with
 * original looks drew fine under the same franchise title. The cell position already maps each
 * portrait to its seat, so the name adds nothing the drawing needs.
 */
export function buildCells(
  game: Pick<Game, 'seats' | 'bots' | 'humanPlayerName'>,
  { generic = false }: { generic?: boolean } = {},
): PortraitCell[] {
  const cells: PortraitCell[] = game.seats.map((seat) => {
    if (seat.isHuman) {
      return {
        key: seatKey(seat.seatIndex),
        label: seat.name,
        prompt: 'the protagonist of this story — an expressive, determined face fitting the setting',
      };
    }
    const bot = game.bots.find((b) => b.name === seat.name);
    const look = generic
      ? GENERIC_LOOK
      : bot?.visualDescription?.trim() || firstSentence(bot?.story ?? '');
    return {
      key: seatKey(seat.seatIndex),
      label: seat.name,
      prompt: `(${bot?.gender ?? 'person'}) ${look}`,
    };
  });
  cells.push({
    key: DEALER_KEY,
    label: 'Dealer',
    prompt: 'the dealer of this card table — a calm, impartial figure fitting the setting, faintly amused, keeper of every secret at the table',
  });
  return cells;
}

/**
 * The refusal fallback's description for every rival. The story model writes a film character's
 * iconic look even when told not to (2026-10-31: Jack Sparrow came back as "kohl-smudged eyes,
 * beaded goatee, red bandana"), and that look alone gets the sheet refused. Redrawn with this
 * instead, the same cast and franchise title drew fine. Gender stays, so voices still match.
 */
const GENERIC_LOOK = 'an original character of this story — a distinct face, build and outfit of your own design, fitting the setting';

export function buildScenePrompt(game: Pick<Game, 'theme' | 'scene' | 'artStyle'>): string {
  const artStyle = sanitizeArtStyle(game.artStyle);
  const style = artStyle ? `in this art style, chosen by the player: "${artStyle}"` : 'in one cohesive illustration style that fits this setting';
  return `An atmospheric establishing shot of the card table where tonight's poker game is played, ${style}. The table, the cards and chips, the room around it; no people in close-up, cinematic composition, inviting with a first hint of tension.

Setting — "${game.theme}": ${game.scene}

No text anywhere in the image.${artStyle ? `\n\nThe whole image must be in this art style: "${artStyle}".` : ''}`;
}

interface Drawn {
  portraits: PortraitSlice[];
  sheet: DrawnSheet;
  scene?: Buffer;
  costUSD: number;
}

/** What a draw has paid Google so far — kept outside the draw so a run that dies partway still bills it. */
interface Ledger {
  spentUSD: number;
}

async function draw(apiKey: string, game: Game, ledger: Ledger): Promise<Drawn> {
  // sharp is native; a dynamic import keeps it out of every bundle that never draws.
  const sharp = (await import('sharp')).default;
  const artStyle = sanitizeArtStyle(game.artStyle);

  // The scene never blocks the portraits: a failed scene is logged and the table has none.
  const scene = generateImage(apiKey, buildScenePrompt(game), '3:2', { imageSize: '1K', thinkingLevel: THINKING_LEVEL })
    .then(async (image) => {
      ledger.spentUSD += image.costUSD;
      return sharp(image.buffer).resize({ width: 1024 }).jpeg({ quality: 80 }).toBuffer();
    })
    .catch(async (error) => {
      log.warn('scene draw failed', { gameId: game.id, error: String(error), refused: isImageRefusalError(error) });
      if (isImageRefusalError(error)) await recordRefusal(game.id, 'scene', error);
      return undefined;
    });

  const drawSheet = (generic: boolean) =>
    drawPortraitSheet(
      apiKey,
      sharp,
      {
        cells: buildCells(game, { generic }),
        purpose: 'a poker game between story characters',
        setting: { title: game.theme, description: game.scene },
        ...(artStyle ? { artStyle } : {}),
      },
      {
        image: { thinkingLevel: THINKING_LEVEL },
        onMismatch: (m) => log.warn(`PORTRAIT_GRID_MISMATCH: ${m.message}`, { gameId: game.id, ...m.detail }),
      },
    );
  // A refused cast is redrawn once with original looks (GENERIC_LOOK) — a refusal is not billed,
  // and a table of fitting strangers beats a table of initials. A second refusal fails the draw.
  let sheet;
  try {
    sheet = await drawSheet(false);
  } catch (error) {
    if (!isImageRefusalError(error)) throw error;
    log.warn('portrait sheet refused — redrawing with original looks', { gameId: game.id, error: String(error) });
    await recordRefusal(game.id, 'cast', error);
    sheet = await drawSheet(true);
  }
  ledger.spentUSD += sheet.costUSD;
  return { portraits: sheet.portraits, sheet: sheet.sheet, scene: await scene, costUSD: ledger.spentUSD };
}

async function recordRefusal(gameId: string, kind: ImageRefusal['kind'], error: unknown): Promise<void> {
  const { FieldValue } = await import('firebase-admin/firestore');
  const refusal: ImageRefusal = { kind, at: Date.now(), message: String((error as Error)?.message ?? error).slice(0, 500) };
  await db
    .collection(COLLECTIONS.games)
    .doc(gameId)
    .update({ 'images.refusals': FieldValue.arrayUnion(refusal) })
    .catch((e) => log.warn('image refusal not recorded', { gameId, error: String(e) }));
}

function portraitEntry(slice: PortraitSlice): PortraitEntry {
  const bg = focusToBackground(circleFocus(slice.framing.circle));
  return { framing: slice.framing, bg: { size: bg.backgroundSize, position: bg.backgroundPosition } };
}

async function store(gameId: string, drawn: Drawn, expireAt: Date | undefined): Promise<void> {
  const images = db.collection(COLLECTIONS.games).doc(gameId).collection(COLLECTIONS.images);
  const now = Date.now();
  const base = { mime: 'image/jpeg', createdAt: now, ...(expireAt ? { expireAt } : {}) };
  const writes: [string, Record<string, unknown>][] = [
    ...drawn.portraits.map((p): [string, Record<string, unknown>] => [p.key, { ...base, data: p.jpeg.toString('base64') }]),
    [SHEET_KEY, { ...base, data: drawn.sheet.jpeg.toString('base64'), width: drawn.sheet.width, height: drawn.sheet.height, cells: drawn.sheet.cells, detected: drawn.sheet.detected }],
    ...(drawn.scene ? [[SCENE_WELCOME_KEY, { ...base, data: drawn.scene.toString('base64') }] as [string, Record<string, unknown>]] : []),
  ];
  for (let i = 0; i < writes.length; i += DOC_BATCH) {
    const batch = db.batch();
    for (const [key, data] of writes.slice(i, i + DOC_BATCH)) batch.set(images.doc(key), data);
    await batch.commit();
  }
}

/** Bill what was drawn. Never throws: the images exist, an empty paid balance must not fail the run. */
async function bill(game: Game, costUSD: number): Promise<void> {
  try {
    await recordImageUsage(game, costUSD);
  } catch (error) {
    log.error('image spend not billed', { gameId: game.id, costUSD, error: String(error) });
  }
}

/**
 * Claim the game's draw and run it: pending (or a stale claim) → generating → ready | failed.
 * Idempotent — a second caller finds the claim and returns. Called from createGame's `after()`
 * and, as a safety net, from the game page when it finds a game still pending.
 */
export async function runPortraitGeneration(gameId: string): Promise<void> {
  const ref = db.collection(COLLECTIONS.games).doc(gameId);
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const game = snap.data() as Game;
    const images = game.images;
    const stale = images?.status === 'generating' && Date.now() - (images.claimedAt ?? 0) > STALE_CLAIM_MS;
    if (images?.status !== 'pending' && !stale) return null;
    tx.update(ref, { 'images.status': 'generating', 'images.claimedAt': Date.now() });
    return { game, expireAt: expiryDate((snap.data() as { expireAt?: unknown }).expireAt) };
  });
  if (!claimed) return;
  const { game, expireAt } = claimed;

  const ledger: Ledger = { spentUSD: 0 };
  const started = Date.now();
  try {
    const apiKey = (await getApiKeysForUser(game.createdBy))[API_KEY_CONSTANTS.GOOGLE];
    if (!apiKey) throw new Error('No Google API key for image generation');

    const drawn = await draw(apiKey, game, ledger);
    await store(gameId, drawn, expireAt);
    await ref.update({
      'images.status': 'ready',
      'images.version': Date.now(),
      'images.portraits': Object.fromEntries(drawn.portraits.map((p) => [p.key, portraitEntry(p)])),
      'images.scene': !!drawn.scene,
    });
    await bill(game, drawn.costUSD);
    log.info('portraits drawn', { gameId, portraits: drawn.portraits.length, scene: !!drawn.scene, costUSD: drawn.costUSD, durationMs: Date.now() - started });
  } catch (error) {
    // A refusal (the model declined the cast) is expected on edgy themes and logs at warn.
    const refused = isImageRefusalError(error);
    log[refused ? 'warn' : 'error']('portrait draw failed', { gameId, refused, error: String(error), costUSD: ledger.spentUSD });
    if (refused) await recordRefusal(gameId, 'cast', error);
    await ref.update({ 'images.status': 'failed' }).catch(() => {});
    if (ledger.spentUSD > 0) await bill(game, ledger.spentUSD);
  }
}
