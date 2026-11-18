// Tiến Lên card model.
// Rank order (low → high): 3 4 5 6 7 8 9 10 J Q K A 2
// Suit order (low → high): ♠ spades, ♣ clubs, ♦ diamonds, ♥ hearts

export const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'] as const
export const SUITS = ['♠', '♣', '♦', '♥'] as const

export interface Card {
  rank: number // index into RANKS (0 = '3', 12 = '2')
  suit: number // index into SUITS (0 = ♠, 3 = ♥)
}

export const RANK_TWO = 12

/** A single number that totally orders every card: rank first, then suit. */
export const cardValue = (c: Card): number => c.rank * 4 + c.suit

export const compareCards = (a: Card, b: Card): number => cardValue(a) - cardValue(b)

export const sortCards = (cards: Card[]): Card[] => [...cards].sort(compareCards)

export const cardId = (c: Card): string => `${RANKS[c.rank]}${SUITS[c.suit]}`

export const isRed = (c: Card): boolean => c.suit >= 2

export function createDeck(): Card[] {
  const deck: Card[] = []
  for (let rank = 0; rank < RANKS.length; rank++) {
    for (let suit = 0; suit < SUITS.length; suit++) deck.push({ rank, suit })
  }
  return deck
}

/** Fisher–Yates shuffle. Pass a custom `random` for deterministic tests. */
export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Deal 13 cards to each of `players` (2–4) players, sorted. */
export function deal(players = 4, random: () => number = Math.random): Card[][] {
  if (players < 2 || players > 4) throw new Error('Tiến Lên needs 2–4 players')
  const deck = shuffle(createDeck(), random)
  return Array.from({ length: players }, (_, p) => sortCards(deck.slice(p * 13, p * 13 + 13)))
}

/** The player holding 3♠ starts the first game. Returns -1 if nobody has it (2–3 players). */
export function findStartingPlayer(hands: Card[][]): number {
  return hands.findIndex((h) => h.some((c) => c.rank === 0 && c.suit === 0))
}
