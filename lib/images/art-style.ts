/**
 * Optional free-text art direction the player types on the new-game page. It goes verbatim
 * into every image prompt of the game (the portrait sheet, the welcome scene), so the whole
 * game shares one look the player chose. Never fed to the story or bot prompts.
 * Ported from werewolf (app/utils/art-style.ts).
 */
export const ART_STYLE_MAX_LENGTH = 300;

/**
 * Normalizes untrusted art-style text before it is persisted or pasted into an image prompt:
 * control characters and newline runs out (they let the prompt be restructured), whitespace
 * collapsed, length capped. Undefined when nothing usable is left, so callers can omit it.
 */
export function sanitizeArtStyle(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, ART_STYLE_MAX_LENGTH)
    .trim();
  return cleaned || undefined;
}
