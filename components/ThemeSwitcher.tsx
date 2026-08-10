'use client';

import { useEffect, useState } from 'react';

export const THEMES = ['parlor', 'pixel', 'flat', 'paper', 'terminal', 'sketch'] as const;
export type Theme = (typeof THEMES)[number];

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState<Theme>('parlor');

  useEffect(() => {
    const saved = localStorage.getItem('poker-theme') as Theme | null;
    if (saved && THEMES.includes(saved)) setTheme(saved);
  }, []);

  const apply = (t: Theme) => {
    setTheme(t);
    if (t === 'parlor') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    localStorage.setItem('poker-theme', t);
  };

  return (
    <div className="hidden items-center gap-1 md:flex">
      {THEMES.map((t) => (
        <button
          key={t}
          onClick={() => apply(t)}
          className={`pill min-h-8 px-2.5 text-[11px] capitalize ${theme === t ? 'pill-on' : ''}`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
