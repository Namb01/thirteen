import { describe, expect, it } from 'vitest'
import { chooseMove } from './ai.ts'
import { type Card } from './cards.ts'
import { type GameState, fourTwosHolder, has3Spades, isOver, newGame, pass, placeOf, play } from './engine.ts'

/** Small seeded RNG so simulated games are reproducible. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function step(s: GameState): GameState {
  const move = chooseMove(s, s.turn)
  return move ? play(s, s.turn, move) : pass(s, s.turn)
}

describe('engine', () => {
  it('starts with the 3♠ holder and requires 3♠ on the first play', () => {
    const s = newGame(mulberry32(1))
    expect(has3Spades(s.hands[s.turn])).toBe(true)
    const other = s.hands[s.turn].find((c) => !(c.rank === 0 && c.suit === 0))!
    expect(() => play(s, s.turn, [other])).toThrow(/3♠/)
    expect(() => pass(s, s.turn)).toThrow() // can't pass when leading
  })

  it('clears the table when everyone else passes', () => {
    let s = newGame(mulberry32(2))
    const leader = s.turn
    s = play(s, leader, [s.hands[leader].find((c) => c.rank === 0 && c.suit === 0)!])
    for (let i = 0; i < 3; i++) s = pass(s, s.turn)
    expect(s.pile).toEqual([])
    expect(s.turn).toBe(leader)
    expect(s.passed).toEqual([false, false, false, false])
  })

  it('AI-only games always finish with legal moves', () => {
    for (let seed = 1; seed <= 200; seed++) {
      let s = newGame(mulberry32(seed))
      let steps = 0
      if (s.instantWin !== null) continue // dealt four 2s: over before anyone plays (tested below)
      while (!isOver(s)) {
        s = step(s) // play/pass throw on anything illegal
        if (++steps > 2000) throw new Error(`seed ${seed} did not finish`)
      }
      // Everyone has a distinct place; the first three emptied their hands, the last didn't.
      expect([...s.finished].sort()).toEqual([0, 1, 2, 3])
      for (const p of s.finished.slice(0, 3)) expect(s.hands[p]).toHaveLength(0)
      expect(s.hands[s.finished[3]].length).toBeGreaterThan(0)
    }
  })

  it('keeps playing after someone goes out, skipping them, until only one player has cards', () => {
    const card = (rank: number, suit: number): Card => ({ rank, suit })
    let s: GameState = {
      hands: [
        [card(2, 0)], // seat 0: 5♠
        [card(1, 0)], // seat 1: 4♠
        [card(0, 2), card(5, 0)], // seat 2: 3♦ 8♠
        [card(0, 3), card(6, 0)], // seat 3: 3♥ 9♠
      ],
      turn: 0,
      pile: [],
      passed: [false, false, false, false],
      firstPlay: false,
      finished: [],
      instantWin: null,
      nextId: 1,
    }

    s = play(s, 0, [card(2, 0)]) // seat 0 goes out: 1st
    expect(s.finished).toEqual([0])
    expect(isOver(s)).toBe(false)
    expect(s.turn).toBe(1)
    s = pass(s, 1)
    s = pass(s, 2)
    s = pass(s, 3)
    // Everyone passed on seat 0's last card: the lead goes to the next player with cards.
    expect(s.pile).toEqual([])
    expect(s.turn).toBe(1)

    s = play(s, 1, [card(1, 0)]) // seat 1 goes out: 2nd
    expect(s.turn).toBe(2) // seat 0 is skipped from now on
    s = play(s, 2, [card(5, 0)]) // 8♠
    s = play(s, 3, [card(6, 0)]) // 9♠
    expect(s.turn).toBe(2) // seats 0 and 1 are skipped
    s = pass(s, 2)
    expect(s.turn).toBe(3) // new round, seat 3 leads
    s = play(s, 3, [card(0, 3)]) // seat 3 goes out: 3rd, so seat 2 is last
    expect(isOver(s)).toBe(true)
    expect(s.finished).toEqual([0, 1, 3, 2])
    expect(placeOf(s, 2)).toBe(4)
    expect(() => pass(s, s.turn)).toThrow()
  })

  it('a player dealt all four 2s wins instantly', () => {
    // Find a deal where someone holds all four 2s (about 1 in 100 deals).
    let seed = 1
    let s = newGame(mulberry32(seed))
    while (s.instantWin === null) s = newGame(mulberry32(++seed))
    const lucky = s.instantWin

    expect(s.hands[lucky].filter((c) => c.rank === 12)).toHaveLength(4)
    expect(isOver(s)).toBe(true)
    expect(s.finished).toEqual([lucky]) // 1st place; nobody else gets a place
    expect(placeOf(s, lucky)).toBe(1)
    expect(placeOf(s, (lucky + 1) % 4)).toBeNull()
    expect(() => play(s, s.turn, [s.hands[s.turn][0]])).toThrow(/over/)
  })

  it('normal deals are not instant wins', () => {
    const s = newGame(mulberry32(1))
    expect(fourTwosHolder(s.hands)).toBe(-1)
    expect(s.instantWin).toBeNull()
    expect(isOver(s)).toBe(false)
  })
})
