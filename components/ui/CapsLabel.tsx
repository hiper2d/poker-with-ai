import type { HTMLAttributes } from 'react';

/** Small uppercase olive label — the Parlor section marker. */
export default function CapsLabel({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`label-caps ${className}`} {...props} />;
}
