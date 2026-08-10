import type { ReactNode } from 'react';

export interface ChatBubbleProps {
  author: string;
  /** Legacy per-character author color — themed authors render dim. */
  authorColor?: string;
  /** my own message — right-aligned */
  mine?: boolean;
  /** system/GM narration — italic display font; highlight=accent for results */
  system?: 'plain' | 'highlight';
  children: ReactNode;
}

/** One table-talk entry in the themed chat: bordered panel, author label, theme bubble ink. */
export default function ChatBubble({ author, mine = false, system, children }: ChatBubbleProps) {
  if (system) {
    return (
      <div className="msg-in max-w-[92%] self-start">
        <div
          className={`font-serif text-[13px] italic leading-normal ${
            system === 'highlight' ? 'text-gold' : 'text-sage'
          }`}
        >
          {children}
        </div>
      </div>
    );
  }
  return (
    <div
      className={`msg-in r-sm max-w-[92%] border border-line px-2.5 py-2 ${
        mine ? 'self-end bg-panel text-right' : 'self-start'
      }`}
      style={mine ? undefined : { background: 'var(--t-bubble)', color: 'var(--t-bubble-ink)' }}
    >
      <div className="mb-0.5 text-[10px] text-sage">{author}</div>
      <div className="text-[12px] leading-normal">{children}</div>
    </div>
  );
}
