const SUIT_SYMBOL: Record<string, string> = { h: '♥', d: '♦', c: '♣', s: '♠' };

export interface PlayingCardProps {
  /** Two-char code like "Ah", "Td" — or "back" for a face-down card. */
  card: string;
  size?: 'sm' | 'lg';
}

/** Themed playing card: rank + suit top-left on theme card stock (red suits use --t-red). */
export default function PlayingCard({ card, size = 'sm' }: PlayingCardProps) {
  const dims = size === 'lg' ? 'h-[74px] w-[52px] text-[15px]' : 'h-[64px] w-[46px] text-[14px]';
  if (card === 'back') return <div className={`card-back ${dims}`} />;
  const suit = card[1];
  const red = suit === 'h' || suit === 'd';
  return (
    <div className={`card-face ${dims} ${red ? 'card-face-red' : ''}`}>
      {card[0] === 'T' ? '10' : card[0]}
      {SUIT_SYMBOL[suit] ?? suit}
    </div>
  );
}
