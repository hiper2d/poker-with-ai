import { Button } from 'poker-with-ai';

export const Variants = () => (
  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
    <Button variant="gold">Host a table</Button>
    <Button variant="moss">Call 400</Button>
    <Button variant="dark">Fold</Button>
  </div>
);

export const Large = () => (
  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
    <Button variant="gold" size="lg">Raise 1,200</Button>
    <Button variant="moss" size="lg">Check</Button>
    <Button variant="dark" size="lg">Cancel</Button>
  </div>
);

export const Disabled = () => (
  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
    <Button variant="gold" disabled>Open the table</Button>
    <Button variant="moss" disabled>Call 400</Button>
  </div>
);
