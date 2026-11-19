import { type Card, RANK_TWO, cardValue, sortCards } from './cards.ts'

export type ComboType =
  | 'single'
  | 'pair'
  | 'triple'
  | 'quad' // four of a kind ("tứ quý")
  | 'straight' // 3+ consecutive ranks ("sảnh")
  | 'pairSequence' // 3+ consecutive pairs ("đôi thông")

export interface Combo {
  type: ComboType
  cards: Card[] // sorted low → high
  length: number // number of cards
  top: number // cardValue of the highest card — decides who wins within a type
}

export const COMBO_LABELS: Record<ComboType, string> = {
  single: 'Single',
  pair: 'Pair',
  triple: 'Triple',
  quad: 'Four of a kind',
  straight: 'Straight',
  pairSequence: 'Consecutive pairs',
}

const allSameRank = (cards: Card[]) => cards.every((c) => c.rank === cards[0].rank)

/** Figure out which combination a set of cards makes, or null if it's not a legal play. */
export function classify(input: Card[]): Combo | null {
  const cards = sortCards(input)
  const n = cards.length
  if (n === 0) return null
  const make = (type: ComboType): Combo => ({ type, cards, length: n, top: cardValue(cards[n - 1]) })

  if (n === 1) return make('single')
  if (allSameRank(cards)) {
    if (n === 2) return make('pair')
    if (n === 3) return make('triple')
    if (n === 4) return make('quad')
  }

  // 2s can never be part of a straight or a pair sequence.
  if (cards.some((c) => c.rank === RANK_TWO)) return null

  // Straight: 3+ cards, each rank exactly one higher than the last.
  if (n >= 3 && cards.every((c, i) => i === 0 || c.rank === cards[i - 1].rank + 1)) {
    return make('straight')
  }

  // Pair sequence: 3+ pairs with consecutive ranks, e.g. 33 44 55.
  if (n >= 6 && n % 2 === 0) {
    let ok = true
    for (let i = 0; i < n; i += 2) {
      if (cards[i].rank !== cards[i + 1].rank) ok = false
      if (i > 0 && cards[i].rank !== cards[i - 2].rank + 1) ok = false
    }
    if (ok) return make('pairSequence')
  }

  return null
}

const isSingleTwo = (c: Combo) => c.type === 'single' && c.cards[0].rank === RANK_TWO
const isPairOfTwos = (c: Combo) => c.type === 'pair' && c.cards[0].rank === RANK_TWO
const pairCount = (c: Combo) => (c.type === 'pairSequence' ? c.length / 2 : 0)

/** Bombs ("chặt"): four of a kind, or 3+ consecutive pairs. The only plays that can beat 2s. */
export const isBomb = (c: Combo) => c.type === 'quad' || c.type === 'pairSequence'

/**
 * Can `play` be laid on top of `current`? (`current` null = free lead.)
 *
 * Normal rule: same type, same number of cards, higher top card.
 * "Chặt" (bomb) rules — house rules vary; these are the common ones:
 *   - 3 consecutive pairs  beats a single 2
 *   - four of a kind       beats a single 2, a pair of 2s, or 3 consecutive pairs
 *   - 4 consecutive pairs  beats a single 2, a pair of 2s, four of a kind, or 3 consecutive pairs
 */
export function canBeat(play: Combo, current: Combo | null): boolean {
  if (!current) return true

  if (play.type === current.type && play.length === current.length) {
    return play.top > current.top
  }

  const pairs = pairCount(play)
  if (isSingleTwo(current)) return play.type === 'quad' || pairs >= 3
  if (isPairOfTwos(current)) return play.type === 'quad' || pairs >= 4
  if (current.type === 'pairSequence' && current.length === 6) return play.type === 'quad' || pairs >= 4
  if (current.type === 'quad') return pairs >= 4

  return false
}
