// Messages between the browser and the game server (server/), sent as JSON over a WebSocket.
// Shared by both sides so they always agree on the shape.

import type { Card } from '../game/cards.ts'
import type { GameState } from '../game/engine.ts'

export type SeatKind = 'open' | 'human' | 'ai'

export interface SeatInfo {
  kind: SeatKind
  name: string
  connected: boolean // humans only: is their browser currently connected
  isHost: boolean
}

export interface RoomInfo {
  code: string
  seats: SeatInfo[] // in table order (seat 0..3)
  you: number // which seat is yours
  status: 'lobby' | 'playing'
}

/**
 * The game as one player sees it. Rotated so that player is always seat 0
 * (the bottom of their screen), and other players' cards are hidden:
 * their hands contain HIDDEN_CARD placeholders, so only the count is known.
 */
export interface GameView {
  dealId: number // changes on every new deal (restarts the shuffle/deal animation)
  state: GameState
  names: string[] // rotated like the state: names[0] is you
}

export const HIDDEN_CARD: Card = { rank: -1, suit: -1 }

export type ClientMessage =
  | { t: 'hello'; id: string } // first message on every connection; id is stored in the browser
  | { t: 'create'; name: string }
  | { t: 'join'; code: string; name: string }
  | { t: 'leave' }
  | { t: 'setSeat'; seat: number; kind: 'open' | 'ai' } // host only, lobby only
  | { t: 'start' } // host only: start, or deal again after a game ends
  | { t: 'play'; cards: Card[] }
  | { t: 'pass' }

export type ServerMessage =
  | { t: 'room'; room: RoomInfo | null } // null = you're not in a room
  | { t: 'game'; game: GameView | null }
  | { t: 'error'; message: string }

export const MAX_NAME_LENGTH = 16
export const ROOM_CODE_LENGTH = 4
