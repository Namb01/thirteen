// A simple rule-based computer player.
// It lists every combination in its hand, keeps the ones that are legal now,
// then picks the "cheapest": low cards first, don't break up pairs/triples,
// save 2s and bombs until an opponent is close to going out.

import { type Card, RANK_TWO, sortCards } from './cards.ts'
import { type Combo, canBeat, classify } from './combos.ts'
import { type GameState, has3Spades, tableTop } from './engine.ts'

function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]]
  if (items.length < k) return []
  const [first, ...rest] = items
  return [...combinations(rest, k - 1).map((c) => [first, ...c]), ...combinations(rest, k)]
}

/** Every useful combination in a hand. Straights use the lowest suit except for the top card. */
export function candidateCombos(hand: Card[]): Combo[] {
  const byRank: Card[][] = Array.from({ length: 13 }, () => [])
  for (const c of sortCards(hand)) byRank[c.rank].push(c)

  const sets: Card[][] = []
  // Singles, pairs, triples, quads.
  for (const group of byRank) {
    for (let k = 1; k <= group.length; k++) sets.push(...combinations(group, k))
  }
  // Straights and consecutive pairs (never containing a 2).
  for (let start = 0; start < RANK_TWO; start++) {
    for (let end = start; end < RANK_TWO && byRank[end].length > 0; end++) {
      if (end - start < 2) continue
      const base = byRank.slice(start, end).map((g) => g[0])
      for (const top of byRank[end]) sets.push([...base, top])
    }
    for (let end = start; end < RANK_TWO && byRank[end].length >= 2; end++) {
      if (end - start < 2) continue
      const base = byRank.slice(start, end).flatMap((g) => g.slice(0, 2))
      for (const pair of combinations(byRank[end], 2)) sets.push([...base, ...pair])
    }
  }
  return sets.map(classify).filter((c): c is Combo => c !== null)
}

const isPower = (c: Combo) =>
  c.type === 'quad' || c.type === 'pairSequence' || c.cards.some((card) => card.rank === RANK_TWO)

const countByRank = (cards: Card[]) => {
  const counts = new Map<number, number>()
  for (const c of cards) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1)
  return counts
}

/** Cards to play, or null to pass. Deterministic for a given state. */
export function chooseMove(s: GameState, player: number): Card[] | null {
  const hand = s.hands[player]
  const top = tableTop(s)
  const leading = top === null

  let options = candidateCombos(hand).filter((c) => canBeat(c, top?.combo ?? null))
  if (s.firstPlay) options = options.filter((c) => has3Spades(c.cards))
  if (options.length === 0) return null

  const goOut = options.find((c) => c.length === hand.length)
  if (goOut) return goOut.cards

  const opponentClose = s.hands.some((h, i) => i !== player && h.length > 0 && h.length <= 3) // 0 = already finished
  const inHand = countByRank(hand)

  const cost = (c: Combo) => {
    let score = c.top
    if (isPower(c)) score += opponentClose ? 10 : 100
    for (const [rank, used] of countByRank(c.cards)) {
      const have = inHand.get(rank)!
      if (used < have) score += have === 4 ? 60 : 12 // breaking up a set
    }
    if (leading) score -= c.length * 6 // shed more cards when free to choose
    return score
  }

  const best = options.reduce((a, b) => (cost(b) < cost(a) ? b : a))

  // When following, hold 2s and bombs back unless the game is getting tight.
  if (!leading && isPower(best) && !opponentClose && hand.length > 4) return null
  return best.cards
}
