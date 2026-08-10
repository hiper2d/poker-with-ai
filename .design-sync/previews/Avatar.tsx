import { Avatar } from 'poker-with-ai';

export const Characters = () => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
    <Avatar name="Nova" color="#5c8f7b" />
    <Avatar name="Duke" color="#8d6a3f" />
    <Avatar name="Kiko" color="#a35f6d" />
    <Avatar name="Lola" color="#96608f" />
  </div>
);

export const Sizes = () => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
    <Avatar name="Vesper" color="#5c8f7b" size="sm" />
    <Avatar name="Vesper" color="#5c8f7b" size="md" />
    <Avatar name="Vesper" color="#5c8f7b" size="lg" />
  </div>
);

export const HumanPlayer = () => <Avatar name="Riley" size="md" />;
