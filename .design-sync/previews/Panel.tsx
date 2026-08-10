import { CapsLabel, Panel } from 'poker-with-ai';

export const Flat = () => (
  <Panel className="p-5" style={{ maxWidth: 420 }}>
    <CapsLabel className="mb-2">Buy-in</CapsLabel>
    <div className="font-serif text-3xl text-parchment tabular-nums">1,000</div>
    <div className="text-sm text-sage">200 big blinds at 2/5</div>
  </Panel>
);

export const Card = () => (
  <Panel variant="card" className="p-5" style={{ maxWidth: 420 }}>
    <div className="font-serif text-2xl text-cream">Velvet Room</div>
    <div className="text-sm text-sage-dim">Slow, chatty, expensive lessons.</div>
  </Panel>
);

export const Glow = () => (
  <Panel variant="glow" className="p-5" style={{ maxWidth: 420 }}>
    <CapsLabel className="mb-2">The scene</CapsLabel>
    <p className="font-serif text-lg italic text-body">
      A private high-stakes game in Montenegro. Everyone at this table has something to lose.
    </p>
  </Panel>
);
