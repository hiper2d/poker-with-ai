import type { ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** gold = accent CTA (Raise), moss = strong outline (Call), dark = quiet outline (Fold) */
  variant?: 'gold' | 'moss' | 'dark';
  size?: 'md' | 'lg';
}

const VARIANT = { gold: 'btn-gold', moss: 'btn-moss', dark: 'btn-dark' } as const;
const SIZE = { md: 'min-h-10 px-4 text-[13px]', lg: 'min-h-[46px] px-5 text-[13px]' } as const;

export default function Button({
  variant = 'gold',
  size = 'md',
  className = '',
  ...props
}: ButtonProps) {
  return <button className={`${VARIANT[variant]} ${SIZE[size]} ${className}`} {...props} />;
}
