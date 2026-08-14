import Avatar from './Avatar';

export interface SeatPillProps {
  name: string;
  stack: number;
  /** Legacy per-character color — themed avatars are accent-colored. */
  avatarColor?: string;
  isHuman?: boolean;
  /** e.g. the model display name for bots */
  tag?: string;
  /** last action this street, e.g. "raise 600" */
  lastAction?: string;
  folded?: boolean;
  /** it's this seat's turn — pulsing accent outline */
  active?: boolean;
  dimmed?: boolean;
  /** show the dealer badge */
  dealer?: boolean;
  /** blind posted this hand */
  blind?: 'SB' | 'BB';
}

/** A player at the table — themed seat plate. Position it absolutely from the parent. */
export default function SeatPill({
  name,
  stack,
  isHuman = false,
  tag,
  lastAction,
  folded = false,
  active = false,
  dimmed = false,
  dealer = false,
  blind,
}: SeatPillProps) {
  const line = folded ? 'folded' : lastAction || stack.toLocaleString();
  return (
    <div className="relative">
      {/* seat-* classes are theme styling hooks — bauhaus rebuilds the plate from them */}
      <div
        className={`seat-pill ${active ? 'seat-pill-active' : ''} ${
          dimmed ? 'seat-pill-dim opacity-40' : ''
        }`}
      >
        <span className="seat-avatar">
          <Avatar name={name} size="sm" />
        </span>
        <div className="seat-meta min-w-0">
          <div className="seat-title flex items-baseline gap-1.5 leading-tight">
            <span className="text-[13px] text-cream">{name}</span>
            {isHuman && <span className="text-[10px] text-sage">you</span>}
            {tag && !isHuman && <span className="seat-tag hidden text-[9px] text-sage sm:inline">{tag}</span>}
          </div>
          <div className="seat-line text-[11px] leading-tight tabular-nums text-sage">
            {line}
            {!folded && lastAction ? ` · ${stack.toLocaleString()}` : ''}
          </div>
        </div>
      </div>
      {dealer && (
        <span className="r-sm absolute -right-1.5 -top-1.5 flex h-4.5 min-w-4.5 items-center justify-center bg-gold px-1 text-[9px] font-bold text-[color:var(--t-acc-ink)]">
          D
        </span>
      )}
      {blind && (
        <span className="r-sm absolute -left-1.5 -top-1.5 flex h-4.5 items-center justify-center border border-line bg-panel px-1 text-[9px] font-bold text-sage">
          {blind}
        </span>
      )}
    </div>
  );
}
