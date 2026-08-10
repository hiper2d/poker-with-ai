import type { ReactNode } from 'react';
import { SeatPill } from 'poker-with-ai';

// In the app seat pills are absolutely positioned on the felt and shrink to content;
// the fit-content wrapper reproduces that sizing inside the card grid.
const Fit = ({ children }: { children: ReactNode }) => (
  <div style={{ width: 'fit-content' }}>{children}</div>
);

export const OnTheirTurn = () => (
  <Fit>
    <SeatPill name="Nova" stack={18240} avatarColor="#5c8f7b" tag="Claude Sonnet" active />
  </Fit>
);

export const Dealer = () => (
  <Fit>
    <SeatPill name="Duke" stack={9400} avatarColor="#8d6a3f" tag="DeepSeek V4 Pro" dealer lastAction="raise 600" />
  </Fit>
);

export const HumanSeat = () => (
  <Fit>
    <SeatPill name="Riley" stack={12450} avatarColor="#d8b25a" isHuman lastAction="call 400" />
  </Fit>
);

export const Folded = () => (
  <Fit>
    <SeatPill name="Kiko" stack={4200} avatarColor="#a35f6d" tag="Grok 4.5" lastAction="fold" folded dimmed />
  </Fit>
);
