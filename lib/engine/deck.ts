import type { Card, Rank, Suit } from './types';

const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS: Suit[] = ['h', 'd', 'c', 's'];

export function freshDeck(): Card[] {
  const deck: Card[] = [];
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      deck.push(`${rank}${suit}`);
    }
  }
  return deck;
}

/** Fisher–Yates with crypto randomness. */
export function shuffle(deck: Card[]): Card[] {
  const cards = [...deck];
  const random = new Uint32Array(cards.length);
  crypto.getRandomValues(random);
  for (let i = cards.length - 1; i > 0; i--) {
    const j = random[i] % (i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export function draw(deck: Card[], count: number): { drawn: Card[]; rest: Card[] } {
  if (count > deck.length) throw new Error(`Cannot draw ${count} from deck of ${deck.length}`);
  return { drawn: deck.slice(0, count), rest: deck.slice(count) };
}
