'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Hides the global nav bar on phone-sized screens while inside a game room (and the
 * dev table preview): in-game chrome collapses to the mobile top bar, whose menu
 * sheet carries the nav links instead. Desktop keeps the nav bar everywhere.
 */
export default function InGameNavGate({ children }: { children: ReactNode }) {
  const path = usePathname();
  const inGame =
    (/^\/games\/[^/]+$/.test(path) && path !== '/games/new') || path === '/dev/table';
  return <div className={inGame ? 'hidden lg:block' : ''}>{children}</div>;
}
