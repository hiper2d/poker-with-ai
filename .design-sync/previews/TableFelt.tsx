import { PlayingCard, SeatPill, TableFelt } from 'poker-with-ai';

export const MidHand = () => (
  <div style={{ maxWidth: 760, padding: '48px 24px' }}>
    <TableFelt
      seats={
        <>
          <div style={{ position: 'absolute', left: '50%', top: '96%', transform: 'translate(-50%,-50%)' }}>
            <SeatPill name="Riley" stack={12450} avatarColor="#d8b25a" isHuman active />
          </div>
          <div style={{ position: 'absolute', left: '12%', top: '18%', transform: 'translate(-50%,-50%)' }}>
            <SeatPill name="Nova" stack={18240} avatarColor="#5c8f7b" tag="Claude Sonnet" lastAction="raise 600" dealer />
          </div>
          <div style={{ position: 'absolute', left: '88%', top: '18%', transform: 'translate(-50%,-50%)' }}>
            <SeatPill name="Duke" stack={9400} avatarColor="#8d6a3f" tag="DeepSeek" lastAction="fold" folded dimmed />
          </div>
        </>
      }
    >
      <div style={{ textAlign: 'center' }}>
        <div className="text-[10px] uppercase tracking-[0.24em] text-[#a9c0ac]">Pot</div>
        <div className="font-serif text-3xl leading-none tabular-nums text-parchment">2,150</div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <PlayingCard card="Ah" />
        <PlayingCard card="Kd" />
        <PlayingCard card="7c" />
      </div>
    </TableFelt>
  </div>
);
