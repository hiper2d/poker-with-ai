'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface ExpandableTextareaProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  className?: string;
  placeholder?: string;
  id?: string;
  /** Collapsed height in pixels. When collapsed, content beyond this is clipped. */
  minHeight?: number;
  'aria-label'?: string;
}

/**
 * A textarea that stays compact by default but expands to fit its full content
 * on click/focus, so long stories don't have to be scrolled inside a tiny box.
 * A pill toggle in the top-right lets the user expand/collapse explicitly.
 * (werewolf's ExpandableTextarea, restyled with the poker theme tokens)
 */
export default function ExpandableTextarea({
  value,
  onChange,
  className = '',
  placeholder,
  id,
  minHeight = 70,
  ...rest
}: ExpandableTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  // Keep the height in sync with expansion state and content.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (expanded) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    } else {
      el.style.height = `${minHeight}px`;
      setOverflowing(el.scrollHeight > minHeight + 1);
    }
  }, [value, expanded, minHeight]);

  // Re-measure collapsed overflow on resize (text reflows at different widths).
  useEffect(() => {
    if (expanded) return;
    const onResize = () => {
      const el = ref.current;
      if (!el) return;
      setOverflowing(el.scrollHeight > minHeight + 1);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [expanded, minHeight]);

  return (
    <div className="relative">
      <textarea
        ref={ref}
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e);
          if (expanded && ref.current) {
            ref.current.style.height = 'auto';
            ref.current.style.height = `${ref.current.scrollHeight}px`;
          }
        }}
        onFocus={() => setExpanded(true)}
        className={`${className} ${expanded ? 'resize-y' : 'cursor-pointer resize-none overflow-hidden'}`}
        {...rest}
      />
      {(overflowing || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-full border border-line bg-panel/90 px-2 py-0.5 text-[10px] text-sage backdrop-blur-sm transition hover:border-gold hover:text-cream"
          title={expanded ? 'Collapse' : 'Expand'}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
          >
            <path d="M2.5 3.5L5 6L7.5 3.5" />
          </svg>
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      )}
    </div>
  );
}
