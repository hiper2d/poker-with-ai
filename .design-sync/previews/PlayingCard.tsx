import { PlayingCard } from 'poker-with-ai';

export const Board = () => (
  <div style={{ display: 'flex', gap: 8 }}>
    <PlayingCard card="Ah" />
    <PlayingCard card="Kd" />
    <PlayingCard card="Qc" />
    <PlayingCard card="Js" />
    <PlayingCard card="Th" />
  </div>
);

export const HoleCards = () => (
  <div style={{ display: 'flex', gap: 8 }}>
    <PlayingCard card="As" size="lg" />
    <PlayingCard card="Ad" size="lg" />
  </div>
);

export const FaceDown = () => (
  <div style={{ display: 'flex', gap: 8 }}>
    <PlayingCard card="back" />
    <PlayingCard card="back" />
  </div>
);
