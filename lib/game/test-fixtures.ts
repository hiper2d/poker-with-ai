/** Shared test builders for game-level tests. Not shipped — imported by *.test.ts only. */
import type { Game, GameMessage } from '@/models/game';

export function msg(
  counter: number,
  type: string,
  text: string,
  author = 'Vex',
  handNumber = 1,
): GameMessage {
  return {
    id: `${String(counter).padStart(6, '0')}-${author}-to-ALL`,
    recipientName: 'ALL',
    authorName: author,
    msg: text,
    messageType: type as GameMessage['messageType'],
    handNumber,
    timestamp: 0,
  };
}

export function gameWith(over: Partial<Game>): Game {
  return {
    id: 'g',
    theme: 't',
    scene: 's',
    status: 'HAND_RESULTS',
    createdBy: 'u',
    createdWithTier: 'api',
    humanPlayerName: 'Paul',
    seats: [
      { seatIndex: 0, name: 'Paul', isHuman: true, stack: 10000, status: 'active' },
      { seatIndex: 1, name: 'Vex', isHuman: false, stack: 10000, status: 'active' },
      { seatIndex: 2, name: 'Mara', isHuman: false, stack: 0, status: 'eliminated' },
    ],
    bots: [
      { name: 'Vex', gender: 'f', story: '', personaId: 'p', aiType: 'claude', summaries: [], chatWatermark: 0 },
      { name: 'Mara', gender: 'f', story: '', personaId: 'p', aiType: 'claude', summaries: [], chatWatermark: 0 },
    ],
    buttonSeat: 0,
    blindLevel: 0,
    handNumber: 4,
    hand: null,
    gameQueue: [],
    chatQueue: [],
    messageCounter: 0,
    handHistory: [],
    gameMasterAiType: 'claude',
    createdAt: 0,
    expireAt: 0,
    ...over,
  } as Game;
}
