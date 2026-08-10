import type { ButtonHTMLAttributes } from 'react';

export interface PillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Gold-tinted selected state (filters, model chips, seat counts). */
  selected?: boolean;
}

export default function Pill({ selected = false, className = '', ...props }: PillProps) {
  return <button className={`pill ${selected ? 'pill-on' : ''} ${className}`} {...props} />;
}
