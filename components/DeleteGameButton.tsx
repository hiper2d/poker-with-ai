'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteGame } from '@/app/actions/game-actions';

/**
 * Trash control for a table card. Lives inside the card's <Link>, so it swallows the
 * click; the confirmation renders as a fixed overlay outside the link's hit area.
 */
export default function DeleteGameButton({ gameId, theme }: { gameId: string; theme: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteGame(gameId);
      setConfirming(false);
      router.refresh();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setConfirming(true);
        }}
        title="Delete this table"
        aria-label={`Delete the ${theme} table`}
        className="flex h-7 w-7 flex-none items-center justify-center rounded-full border border-line text-sage transition hover:border-loss hover:text-loss"
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          <path d="M2 3.5h10M5.5 3.5V2.25h3V3.5M3.5 3.5l.6 8.25a1 1 0 0 0 1 .95h3.8a1 1 0 0 0 1-.95l.6-8.25M5.8 6v4M8.2 6v4" />
        </svg>
      </button>
      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!busy) setConfirming(false);
          }}
        >
          <div
            className="w-full max-w-sm r-md border border-line bg-panel p-5 shadow-theme"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <div className="label-caps mb-1.5">Delete table</div>
            <p className="font-serif text-xl leading-snug text-cream">
              Burn &ldquo;{theme}&rdquo;?
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-sage">
              The game and its whole table-talk history are deleted for good. This cannot be
              undone.
            </p>
            {error && <p className="mt-2 text-sm text-loss">{error}</p>}
            <div className="mt-4 flex justify-end gap-2.5">
              <button
                disabled={busy}
                onClick={() => setConfirming(false)}
                className="r-sm border border-line px-4 py-2 text-[13px] text-sage transition hover:border-gold hover:text-cream disabled:opacity-50"
              >
                Keep it
              </button>
              <button
                disabled={busy}
                onClick={() => void onDelete()}
                className="r-sm border border-loss px-4 py-2 text-[13px] text-loss transition hover:bg-[color-mix(in_srgb,var(--t-red)_12%,transparent)] disabled:opacity-50"
              >
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
