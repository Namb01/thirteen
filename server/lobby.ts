// Rooms and online games. Pure logic: no sockets here, so it can be unit-tested.
// server/index.ts connects real WebSockets to this.
//
// The server is the only source of truth: it deals, checks every play with the
// same engine the browser uses, runs the computer players, and sends each player
// only what they're allowed to see.

import { chooseMove } from '../src/game/ai.ts'
import type { Card } from '../src/game/cards.ts'
import { type GameState, PLAYER_COUNT, isOver, newGame, pass, play } from '../src/game/engine.ts'
import {
  type ClientMessage,
  type GameView,
  HIDDEN_CARD,
  MAX_NAME_LENGTH,
  ROOM_CODE_LENGTH,
  type RoomInfo,
  type SeatKind,
  type ServerMessage,
} from '../src/net/protocol.ts'
import { AI_DELAY_MS, FIRST_MOVE_DELAY_MS } from '../src/game/timing.ts'

export interface Client {
  send(msg: ServerMessage): void
}

interface Seat {
  kind: SeatKind
  name: string
  playerId?: string // humans only
}

interface Room {
  code: string
  hostId: string
  seats: Seat[]
  status: 'lobby' | 'playing'
  game: GameState | null
  dealId: number
  turnTimer?: ReturnType<typeof setTimeout>
  emptyTimer?: ReturnType<typeof setTimeout>
}

export interface LobbyOptions {
  aiDelayMs?: number // pause before a computer player moves
  firstMoveDelayMs?: number // after a deal, leave time for the shuffle/deal animation
  emptyRoomTtlMs?: number // delete a room this long after its last human disconnects
  random?: () => number
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ' // no I, L, O: easy to read aloud

export class Lobby {
  private rooms = new Map<string, Room>()
  private playerRoom = new Map<string, string>() // playerId → room code
  private clients = new Map<string, Client>() // playerId → current connection
  private opts: Required<LobbyOptions>

  constructor(opts: LobbyOptions = {}) {
    this.opts = {
      aiDelayMs: AI_DELAY_MS,
      firstMoveDelayMs: FIRST_MOVE_DELAY_MS,
      emptyRoomTtlMs: 5 * 60_000,
      random: Math.random,
      ...opts,
    }
  }

  // ---------- connections ----------

  connect(playerId: string, client: Client) {
    this.clients.set(playerId, client)
    const room = this.roomOf(playerId)
    if (!room) return client.send({ t: 'room', room: null })
    clearTimeout(room.emptyTimer)
    this.broadcast(room)
    this.scheduleTurn(room) // their seat may have been auto-playing while away
  }

  /** Call when a socket closes. Ignored if that player has since reconnected elsewhere. */
  disconnect(playerId: string, client: Client) {
    if (this.clients.get(playerId) !== client) return
    this.clients.delete(playerId)
    const room = this.roomOf(playerId)
    if (!room) return
    this.broadcast(room)
    this.scheduleTurn(room) // if it's their turn, a computer plays for them
    this.expireIfEmpty(room)
  }

  handle(playerId: string, msg: ClientMessage) {
    try {
      this.dispatch(playerId, msg)
    } catch (e) {
      this.clients.get(playerId)?.send({ t: 'error', message: e instanceof Error ? e.message : 'Something went wrong' })
    }
  }

  // ---------- messages ----------

  private dispatch(playerId: string, msg: ClientMessage) {
    switch (msg.t) {
      case 'create': {
        this.leave(playerId)
        const code = this.newCode()
        const seats: Seat[] = Array.from({ length: PLAYER_COUNT }, () => ({ kind: 'open', name: '' }))
        seats[0] = { kind: 'human', name: cleanName(msg.name), playerId }
        const room: Room = { code, hostId: playerId, seats, status: 'lobby', game: null, dealId: 0 }
        this.rooms.set(code, room)
        this.playerRoom.set(playerId, code)
        this.broadcast(room)
        return
      }
      case 'join': {
        const code = String(msg.code ?? '').trim().toUpperCase()
        const room = this.rooms.get(code)
        if (!room) throw new Error(`No room with code ${code}`)
        if (this.seatOf(room, playerId) >= 0) return this.connect(playerId, this.clients.get(playerId)!) // rejoin
        if (room.status !== 'lobby') throw new Error('That game has already started')
        const seat = room.seats.findIndex((s) => s.kind === 'open')
        if (seat < 0) throw new Error('That room is full')
        this.leave(playerId)
        room.seats[seat] = { kind: 'human', name: cleanName(msg.name), playerId }
        this.playerRoom.set(playerId, code)
        clearTimeout(room.emptyTimer)
        this.broadcast(room)
        return
      }
      case 'leave':
        this.leave(playerId)
        this.clients.get(playerId)?.send({ t: 'room', room: null })
        this.clients.get(playerId)?.send({ t: 'game', game: null })
        return
      case 'setSeat': {
        const room = this.hostRoom(playerId)
        if (room.status !== 'lobby') throw new Error('The game has already started')
        if (!Number.isInteger(msg.seat) || msg.seat < 0 || msg.seat >= PLAYER_COUNT) throw new Error('No such seat')
        const seat = room.seats[msg.seat]
        if (seat.kind === 'human') throw new Error('That seat is taken')
        room.seats[msg.seat] = msg.kind === 'ai' ? { kind: 'ai', name: this.aiName(room) } : { kind: 'open', name: '' }
        this.broadcast(room)
        return
      }
      case 'start': {
        const room = this.hostRoom(playerId)
        if (room.status === 'playing' && room.game && !isOver(room.game)) throw new Error('A game is already in progress')
        if (room.seats.some((s) => s.kind === 'open')) throw new Error('Fill every seat with a player or a computer first')
        room.status = 'playing'
        room.game = newGame(this.opts.random)
        room.dealId++
        this.broadcast(room)
        this.scheduleTurn(room, this.opts.firstMoveDelayMs)
        return
      }
      case 'play':
      case 'pass': {
        const room = this.roomOf(playerId)
        if (!room?.game) throw new Error('No game in progress')
        const seat = this.seatOf(room, playerId)
        if (msg.t === 'play') {
          if (!Array.isArray(msg.cards)) throw new Error('Bad cards')
          const cards: Card[] = msg.cards.map((c) => ({ rank: Number(c?.rank), suit: Number(c?.suit) }))
          room.game = play(room.game, seat, cards) // throws a readable reason if illegal
        } else {
          room.game = pass(room.game, seat)
        }
        this.broadcast(room)
        this.scheduleTurn(room)
        return
      }
      default:
        throw new Error('Unknown message')
    }
  }

  private leave(playerId: string) {
    const room = this.roomOf(playerId)
    this.playerRoom.delete(playerId)
    if (!room) return
    const seat = this.seatOf(room, playerId)
    if (seat >= 0) {
      // Mid-game a computer takes over the seat; in the lobby it just opens up.
      room.seats[seat] =
        room.status === 'playing'
          ? { kind: 'ai', name: `${room.seats[seat].name} (AI)` }
          : { kind: 'open', name: '' }
    }
    if (room.hostId === playerId) {
      const next = room.seats.find((s) => s.kind === 'human')
      if (next?.playerId) room.hostId = next.playerId
    }
    if (!room.seats.some((s) => s.kind === 'human')) return this.deleteRoom(room)
    this.broadcast(room)
    this.scheduleTurn(room)
  }

  // ---------- game flow ----------

  /** If the player to move is a computer (or a human who disconnected), move for them after a pause. */
  private scheduleTurn(room: Room, delay = this.opts.aiDelayMs) {
    clearTimeout(room.turnTimer)
    const game = room.game
    if (!game || isOver(game)) return
    const seat = room.seats[game.turn]
    const auto = seat.kind !== 'human' || !this.clients.has(seat.playerId!)
    if (!auto) return
    room.turnTimer = setTimeout(() => {
      if (room.game !== game) return // something changed meanwhile
      const move = chooseMove(game, game.turn)
      room.game = move ? play(game, game.turn, move) : pass(game, game.turn)
      this.broadcast(room)
      this.scheduleTurn(room)
    }, delay)
  }

  // ---------- sending ----------

  private broadcast(room: Room) {
    room.seats.forEach((seat, i) => {
      const client = seat.playerId ? this.clients.get(seat.playerId) : undefined
      if (!client) return
      client.send({ t: 'room', room: this.roomInfo(room, i) })
      client.send({ t: 'game', game: room.game ? this.view(room, i) : null })
    })
  }

  private roomInfo(room: Room, you: number): RoomInfo {
    return {
      code: room.code,
      you,
      status: room.status,
      seats: room.seats.map((s) => ({
        kind: s.kind,
        name: s.name,
        connected: s.kind === 'human' && this.clients.has(s.playerId!),
        isHost: s.playerId === room.hostId,
      })),
    }
  }

  /** The game from seat `me`'s point of view: rotated so they're seat 0, others' cards hidden. */
  private view(room: Room, me: number): GameView {
    const g = room.game!
    const rot = (seat: number) => (seat - me + PLAYER_COUNT) % PLAYER_COUNT
    const fromMe = <T,>(arr: T[]) => arr.map((_, i) => arr[(i + me) % PLAYER_COUNT])
    return {
      dealId: room.dealId,
      names: fromMe(room.seats.map((s) => s.name)),
      state: {
        ...g,
        hands: fromMe(g.hands).map((h, i) => (i === 0 ? h : h.map(() => HIDDEN_CARD))),
        passed: fromMe(g.passed),
        turn: rot(g.turn),
        finished: g.finished.map(rot),
        instantWin: g.instantWin === null ? null : rot(g.instantWin),
        pile: g.pile.map((p) => ({ ...p, by: rot(p.by) })),
      },
    }
  }

  // ---------- helpers ----------

  private roomOf(playerId: string) {
    const code = this.playerRoom.get(playerId)
    return code ? this.rooms.get(code) : undefined
  }

  private seatOf(room: Room, playerId: string) {
    return room.seats.findIndex((s) => s.playerId === playerId)
  }

  private hostRoom(playerId: string) {
    const room = this.roomOf(playerId)
    if (!room) throw new Error("You're not in a room")
    if (room.hostId !== playerId) throw new Error('Only the host can do that')
    return room
  }

  private aiName(room: Room) {
    for (let n = 1; ; n++) {
      const name = `Computer ${n}`
      if (!room.seats.some((s) => s.name === name)) return name
    }
  }

  private newCode() {
    for (;;) {
      let code = ''
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(this.opts.random() * CODE_ALPHABET.length)]
      if (!this.rooms.has(code)) return code
    }
  }

  private expireIfEmpty(room: Room) {
    const anyoneHere = room.seats.some((s) => s.kind === 'human' && this.clients.has(s.playerId!))
    if (anyoneHere) return
    clearTimeout(room.emptyTimer)
    room.emptyTimer = setTimeout(() => this.deleteRoom(room), this.opts.emptyRoomTtlMs)
  }

  private deleteRoom(room: Room) {
    clearTimeout(room.turnTimer)
    clearTimeout(room.emptyTimer)
    this.rooms.delete(room.code)
    for (const s of room.seats) if (s.playerId && this.playerRoom.get(s.playerId) === room.code) this.playerRoom.delete(s.playerId)
  }

  /** For tests and monitoring. */
  get roomCount() {
    return this.rooms.size
  }
}

function cleanName(name: unknown) {
  const s = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH)
  return s || 'Player'
}
