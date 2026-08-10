import { ChatBubble } from 'poker-with-ai';

export const Conversation = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 380 }}>
    <ChatBubble author="Nova · solver" authorColor="#5c8f7b">
      Your sizing tells me more than your face does.
    </ChatBubble>
    <ChatBubble author="You" mine>
      Big talk for someone who folded three hands straight.
    </ChatBubble>
    <ChatBubble author="Nova · solver" authorColor="#5c8f7b">
      Patience is a strategy. Panic is not.
    </ChatBubble>
  </div>
);

export const GameMaster = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 380 }}>
    <ChatBubble author="GM" system="plain">
      A private high-stakes game in Montenegro. Everyone here has something to lose.
    </ChatBubble>
    <ChatBubble author="GM" system="highlight">
      Nova wins 6,180 with a full house, kings over sevens.
    </ChatBubble>
  </div>
);
