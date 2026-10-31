export interface AvatarProps {
  name: string;
  /** Legacy per-character color — the themed design uses the accent for all avatars. */
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  /** A drawn portrait (lib/images/view.ts); the initial shows until it is ready. */
  portrait?: { src: string; bg: { size: string; position: string } };
}

const SIZE = {
  sm: 'h-7 w-7 text-[12px]',
  md: 'h-9 w-9 text-[15px]',
  lg: 'h-[64px] w-[64px] text-[26px]',
} as const;

/** Themed initial avatar: accent block, small radius, display font. */
export default function Avatar({ name, size = 'md', portrait }: AvatarProps) {
  if (portrait) {
    return (
      <div
        role="img"
        aria-label={name}
        className={`r-sm ${SIZE[size]} flex-none bg-panel bg-no-repeat`}
        style={{
          backgroundImage: `url("${portrait.src}")`,
          backgroundSize: portrait.bg.size,
          backgroundPosition: portrait.bg.position,
        }}
      />
    );
  }
  return (
    <div
      className={`r-sm flex ${SIZE[size]} flex-none items-center justify-center bg-gold font-serif text-[color:var(--t-acc-ink)]`}
    >
      {name[0]?.toUpperCase()}
    </div>
  );
}
