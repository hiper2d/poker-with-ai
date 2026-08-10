import type { HTMLAttributes } from 'react';

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  /** kept for API compatibility — all variants share the themed panel surface */
  variant?: 'flat' | 'card' | 'glow';
}

export default function Panel({ variant: _variant = 'flat', className = '', ...props }: PanelProps) {
  return (
    <div
      className={`r-md shadow-theme border border-line bg-panel ${className}`}
      {...props}
    />
  );
}
