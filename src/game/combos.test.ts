import { describe, expect, it } from 'vitest'
import { type Card, RANKS, SUITS, createDeck, deal, findStartingPlayer } from './cards.ts'
import { canBeat, classify } from './combos.ts'

/** Parse "3♠ 4♥ 10♦" into cards. */
const c = (s: string): Card[] =>
  s.split(' ').map((t) => {
    const suit = SUITS.indexOf(t.slice(-1) as (typeof SUITS)[number])
    const rank = RANKS.indexOf(t.slice(0, -1) as (typeof RANKS)[number])
    if (suit < 0 || rank < 0) throw new Error(`bad card ${t}`)
    return { rank, suit }
  })

const combo = (s: string) => {
  const r = classify(c(s))
  if (!r) throw new Error(`not a combo: ${s}`)
  return r
}

describe('deck', () => {
  it('has 52 unique cards and deals 13 each', () => {
    expect(createDeck()).toHaveLength(52)
    const hands = deal(4)
    expect(hands.map((h) => h.length)).toEqual([13, 13, 13, 13])
    expect(findStartingPlayer(hands)).toBeGreaterThanOrEqual(0)
  })
})

describe('classify', () => {
  it.each([
    ['3♠', 'single'],
    ['7♣ 7♥', 'pair'],
    ['K♠ K♣ K♦', 'triple'],
    ['9♠ 9♣ 9♦ 9♥', 'quad'],
    ['3♠ 4♣ 5♦', 'straight'],
    ['10♠ J♣ Q♦ K♥ A♠', 'straight'],
    ['3♠ 3♣ 4♦ 4♥ 5♠ 5♣', 'pairSequence'],
  ])('%s → %s', (cards, type) => {
    expect(classify(c(cards))?.type).toBe(type)
  })

  it.each(['3♠ 5♣', 'Q♠ K♣ A♦ 2♥', '3♠ 4♣ 6♦', 'A♠ A♣ 2♦ 2♥ 3♠ 3♣'])('%s is not a combo', (cards) => {
    expect(classify(c(cards))).toBeNull()
  })
})

describe('canBeat', () => {
  it('compares by rank then suit within a type', () => {
    expect(canBeat(combo('4♠'), combo('3♥'))).toBe(true)
    expect(canBeat(combo('3♥'), combo('3♠'))).toBe(true)
    expect(canBeat(combo('3♠'), combo('3♥'))).toBe(false)
    expect(canBeat(combo('5♠ 6♠ 7♥'), combo('5♣ 6♦ 7♦'))).toBe(true)
  })

  it('requires the same type and length', () => {
    expect(canBeat(combo('8♠ 8♣'), combo('3♠'))).toBe(false)
    expect(canBeat(combo('3♠ 4♠ 5♠ 6♠'), combo('7♠ 8♠ 9♠'))).toBe(false)
  })

  it('applies bomb rules', () => {
    expect(canBeat(combo('3♠ 3♣ 4♦ 4♥ 5♠ 5♣'), combo('2♥'))).toBe(true)
    expect(canBeat(combo('3♠ 3♣ 3♦ 3♥'), combo('2♠ 2♥'))).toBe(true)
    expect(canBeat(combo('3♠ 3♣ 4♦ 4♥ 5♠ 5♣'), combo('2♠ 2♥'))).toBe(false)
    expect(canBeat(combo('3♠ 3♣ 4♦ 4♥ 5♠ 5♣ 6♠ 6♣'), combo('A♠ A♣ A♦ A♥'))).toBe(true)
  })
})
