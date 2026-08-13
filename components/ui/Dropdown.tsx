'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Minimal themed dropdown: a pill trigger and an anchored panel. Closes on outside
 * click and on any click inside the panel (menu semantics — every item is an action).
 */
export default function Dropdown({
  label,
  ariaLabel,
  className = '',
  children,
}: {
  label: ReactNode;
  ariaLabel: string;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={ariaLabel}
        className={`pill flex min-h-8 items-center gap-1.5 px-2.5 text-[11px] ${open ? 'pill-on' : ''}`}
      >
        {label}
        <span aria-hidden className="text-[9px]">
          ▾
        </span>
      </button>
      {open && (
        <div
          role="menu"
          onClick={() => setOpen(false)}
          className="r-md absolute right-0 top-full z-30 mt-2 flex min-w-[150px] flex-col gap-0.5 border border-line bg-page p-1.5 shadow-theme"
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** Shared row styling for Dropdown items — buttons and links alike. */
export const DROPDOWN_ITEM =
  'r-sm px-3 py-2 text-left text-[13px] tracking-[0.04em] text-sage hover:bg-panel hover:text-cream';
