/**
 * Client-safe image lookups: which stored image stands for whom, and its URL. The keys are the
 * ones lib/images/portraits.ts writes under (server-only); this module must stay free of
 * firebase / sharp imports so components can use it.
 */
import type { Game } from '@/models/game';

export const DEALER_KEY = 'dealer';
export const SCENE_WELCOME_KEY = 'scene-welcome';
export const SHEET_KEY = 'sheet-0';
export const seatKey = (seatIndex: number) => `p${seatIndex}`;
/** Who authors GM narration in the message log. */
const GM_AUTHOR = 'GM';

export interface PortraitView {
  src: string;
  /** CSS background-size / -position that frame the face circle on the card. */
  bg: { size: string; position: string };
}

export function imageUrl(game: Pick<Game, 'id' | 'images'>, key: string): string {
  return `/api/games/${encodeURIComponent(game.id)}/images/${encodeURIComponent(key)}?v=${game.images?.version ?? 0}`;
}

/** The portrait for a seat name (or the GM), once the draw is ready. */
export function portraitOf(game: Pick<Game, 'id' | 'images' | 'seats'>, name: string): PortraitView | undefined {
  const images = game.images;
  if (images?.status !== 'ready' || !images.portraits) return undefined;
  const seat = game.seats.find((s) => s.name === name);
  const key = seat ? seatKey(seat.seatIndex) : name === GM_AUTHOR ? DEALER_KEY : undefined;
  const entry = key ? images.portraits[key] : undefined;
  return entry && key ? { src: imageUrl(game, key), bg: entry.bg } : undefined;
}

export function sceneUrlOf(game: Pick<Game, 'id' | 'images'>): string | undefined {
  return game.images?.status === 'ready' && game.images.scene ? imageUrl(game, SCENE_WELCOME_KEY) : undefined;
}

/** True while a draw may still land — the game page polls for it. */
export function imagesInFlight(game: Pick<Game, 'images'>): boolean {
  return game.images?.status === 'pending' || game.images?.status === 'generating';
}
