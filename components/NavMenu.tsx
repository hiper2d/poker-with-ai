'use client';

import Link from 'next/link';
import Dropdown, { DROPDOWN_ITEM } from '@/components/ui/Dropdown';

/** Narrow-screen nav: the page links grouped into one dropdown (inline on md+). */
export default function NavMenu({ links }: { links: { href: string; label: string }[] }) {
  return (
    <Dropdown ariaLabel="Menu" label="Menu" className="md:hidden">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className={DROPDOWN_ITEM}>
          {l.label}
        </Link>
      ))}
    </Dropdown>
  );
}
