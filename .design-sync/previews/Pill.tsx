import { Pill } from 'poker-with-ai';

export const States = () => (
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
    <Pill>All</Pill>
    <Pill selected>Turbo</Pill>
    <Pill>Heads-up</Pill>
    <Pill>High stakes</Pill>
  </div>
);

export const ModelChips = () => (
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
    <Pill selected>Claude Sonnet</Pill>
    <Pill selected>DeepSeek V4 Pro</Pill>
    <Pill>Gemini 3.1 Pro</Pill>
    <Pill>Grok 4.5</Pill>
    <Pill>Kimi K3</Pill>
  </div>
);
