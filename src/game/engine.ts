// Turn and round flow for a 4-player game of Tiến Lên.
//
// Seats go counter-clockwise: 0 = bottom (you), 1 = right, 2 = top, 3 = left.
// A round: the leader plays any combination, then each player in turn must beat
// the top play or pass. Passing locks you out until the round ends. When everyone
// else has passed, the last player to play clears the table and leads again.
// Players who empty their hand finish in order (1st, 2nd, 3rd) and are skipped from
// then on; when only one player still has cards, they take last place and the game ends.
// If everyone passes on the last play of someone who just went out, the lead goes to
// the next player who still has cards.
// Instant win: a player dealt all four 2s wins on the spot; the game ends before anyone plays.
// Who starts: the very first game, the holder of 3♠, who must include it. Every game after
// that (Play again / New game), last game's 1st place leads with any combination.

import { type Card, RANK_TWO, cardId, deal, findStartingPlayer } from './cards.ts'
import { COMBO_LABELS, type Combo, canBeat, classify } from './combos.ts'

export const PLAYER_COUNT = 4

export interface TablePlay {
  combo: Combo
  by: number
  id: number // unique per game, handy as a React key
}

export interface GameState {
  hands: Card[][]
  turn: number
  pile: TablePlay[] // plays made this round; the last one is what you have to beat
  passed: boolean[] // who has passed this round
  firstPlay: boolean // the first play must include 3♠ (only in a session's first game; see newGame)
  finished: number[] // seats in finishing order: finished[0] came 1st. Full (all 4) once the game is over
  instantWin: number | null // seat that was dealt all four 2s and won immediately; nobody else gets a place
  nextId: number
}

/** True once everyone has a place (the last player left holding cards is placed automatically), or after an instant win. */
export const isOver = (s: GameState) => s.finished.length === PLAYER_COUNT || s.instantWin !== null

/** The seat holding all four 2s, or -1. */
export const fourTwosHolder = (hands: Card[][]) =>
  hands.findIndex((h) => h.filter((c) => c.rank === RANK_TWO).length === 4)

/** 1-based finishing place of `player`, or null if they're still playing. */
export const placeOf = (s: GameState, player: number): number | null => {
  const i = s.finished.indexOf(player)
  return i < 0 ? null : i + 1
}

export const ordinal = (n: number) => `${n}${['st', 'nd', 'rd'][n - 1] ?? 'th'}`

export const tableTop = (s: GameState): TablePlay | null => s.pile.at(-1) ?? null

export const has3Spades = (cards: Card[]) => cards.some((c) => c.rank === 0 && c.suit === 0)

/**
 * Deal a new game. `leader`: who came 1st last game, if this isn't the first game; they lead
 * with anything. Without it (the first game), the holder of 3♠ leads and must include it.
 */
export function newGame(random: () => number = Math.random, leader?: number | null): GameState {
  return gameFromHands(deal(PLAYER_COUNT, random), leader)
}

/** Seat that came 1st in a finished game (also after an instant win), to lead the next one. */
export const winnerOf = (s: GameState | null | undefined): number | null => (s && isOver(s) ? (s.finished[0] ?? null) : null)

/** True until the first card of the game is played (the deal animation is still showing). */
export const notStarted = (s: GameState) => s.nextId === 1

/** Start a game from given hands (newGame deals them at random). */
export function gameFromHands(hands: Card[][], leader?: number | null): GameState {
  const lucky = fourTwosHolder(hands)
  const winnerLeads = leader !== undefined && leader !== null
  return {
    hands,
    turn: winnerLeads ? leader : findStartingPlayer(hands),
    pile: [],
    passed: Array(PLAYER_COUNT).fill(false),
    firstPlay: !winnerLeads,
    finished: lucky >= 0 ? [lucky] : [],
    instantWin: lucky >= 0 ? lucky : null,
    nextId: 1,
  }
}

/** Returns why `cards` can't be played right now, or null if the play is legal. */
export function validatePlay(s: GameState, player: number, cards: Card[]): string | null {
  if (isOver(s)) return 'The game is over'
  if (s.turn !== player) return 'Not your turn'
  if (cards.length === 0) return 'Select cards to play'
  const inHand = new Set(s.hands[player].map(cardId))
  if (!cards.every((c) => inHand.has(cardId(c)))) return 'Those cards are not in your hand'
  const combo = classify(cards)
  if (!combo) return 'Not a valid combination'
  if (s.firstPlay && !has3Spades(cards)) return 'The first play must include 3♠'
  const top = tableTop(s)
  if (!canBeat(combo, top?.combo ?? null)) return `Doesn't beat the ${COMBO_LABELS[top!.combo.type].toLowerCase()}`
  return null
}

export const canPass = (s: GameState, player: number) => !isOver(s) && s.turn === player && s.pile.length > 0

export function play(s: GameState, player: number, cards: Card[]): GameState {
  const error = validatePlay(s, player, cards)
  if (error) throw new Error(error)
  const ids = new Set(cards.map(cardId))
  const hands = s.hands.map((h, i) => (i === player ? h.filter((c) => !ids.has(cardId(c))) : h))
  const next: GameState = {
    ...s,
    hands,
    pile: [...s.pile, { combo: classify(cards)!, by: player, id: s.nextId }],
    firstPlay: false,
    nextId: s.nextId + 1,
  }
  if (hands[player].length === 0) {
    next.finished = [...s.finished, player]
    const stillIn = hands.flatMap((h, i) => (h.length > 0 ? [i] : []))
    if (stillIn.length === 1) return { ...next, finished: [...next.finished, stillIn[0]] } // last place; game over
  }
  return advance(next, player)
}

export function pass(s: GameState, player: number): GameState {
  if (!canPass(s, player)) throw new Error("Can't pass now")
  const passed = s.passed.map((p, i) => p || i === player)
  return advance({ ...s, passed }, player)
}

/** Next seat after `from` (going round the table) that still has cards. */
function nextWithCards(s: GameState, from: number): number {
  for (let i = 1; i <= PLAYER_COUNT; i++) {
    const p = (from + i) % PLAYER_COUNT
    if (s.hands[p].length > 0) return p
  }
  return from
}

/** Hand the turn to the next player still in the round, or start a new round. */
function advance(s: GameState, from: number): GameState {
  const leader = tableTop(s)!.by
  for (let i = 1; i <= PLAYER_COUNT; i++) {
    const p = (from + i) % PLAYER_COUNT
    if (p === leader) {
      // Everyone else passed: clear the table. The last player to play leads,
      // or, if they've just gone out, the next player who still has cards.
      const turn = s.hands[leader].length > 0 ? leader : nextWithCards(s, leader)
      return { ...s, pile: [], passed: Array(PLAYER_COUNT).fill(false), turn }
    }
    if (s.passed[p] || s.hands[p].length === 0) continue // passed this round, or already finished
    return { ...s, turn: p }
  }
  return s // unreachable: the loop always reaches the leader
}
