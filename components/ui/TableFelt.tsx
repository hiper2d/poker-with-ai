import type { ReactNode } from 'react';

export interface TableFeltProps {
  /** Centered on the felt (pot, board cards). */
  children?: ReactNode;
  /** Absolutely-positioned overlays (seat pills). */
  seats?: ReactNode;
}

/** The wood-rimmed oval poker table. Seats position themselves absolutely within it. */
export default function TableFelt({ children, seats }: TableFeltProps) {
  return (
    <div className="table-felt">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">{children}</div>
      {seats}
    </div>
  );
}
