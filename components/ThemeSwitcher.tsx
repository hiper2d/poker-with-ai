'use client';

import { useSyncExternalStore } from 'react';
import Dropdown, { DROPDOWN_ITEM } from '@/components/ui/Dropdown';

export const THEMES = ['parlor', 'pixel', 'flat', 'paper', 'terminal', 'sketch'] as const;
export type Theme = (typeof THEMES)[number];

// The theme lives in localStorage (applied before paint by the layout boot script);
// this store just lets React re-render the trigger label when it changes.
let listeners: Array<() => void> = [];
const subscribe = (cb: () => void) => {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
};
const getTheme = (): Theme => {
  const saved = localStorage.getItem('poker-theme') as Theme | null;
  return saved && THEMES.includes(saved) ? saved : 'parlor';
};

function apply(t: Theme) {
  if (t === 'parlor') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('poker-theme', t);
  for (const l of listeners) l();
}

export default function ThemeSwitcher() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => 'parlor' as Theme);

  return (
    <Dropdown ariaLabel="Theme" label={<span className="capitalize">{theme}</span>}>
      {THEMES.map((t) => (
        <button
          key={t}
          onClick={() => apply(t)}
          className={`${DROPDOWN_ITEM} capitalize ${theme === t ? 'text-gold-pale' : ''}`}
        >
          {t}
        </button>
      ))}
    </Dropdown>
  );
}
