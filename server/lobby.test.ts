import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chooseMove } from '../src/game/ai.ts'
import { isOver } from '../src/game/engine.ts'
import type { GameView, RoomInfo, ServerMessage } from '../src/net/protocol.ts'
import { Lobby } from './lobby.ts'

/** A fake browser: records the latest room/game/error the server sent it. */
function fakeClient() {
  const c = {
    room: undefined as RoomInfo | null | undefined,
    game: undefined as GameView | null | undefined,
    errors: [] as string[],
    send(msg: ServerMessage) {
      if (msg.t === 'room') c.room = msg.room
      else if (msg.t === 'game') c.game = msg.game
      else c.errors.push(msg.message)
    },
  }
  return c
}

/** Seeded RNG so deals (and therefore these tests) are the same every run. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const AI_DELAY = 30
const FIRST_DELAY = 50

describe('Lobby', () => {
  let lobby: Lobby
  beforeEach(() => {
    vi.useFakeTimers()
    lobby = new Lobby({ aiDelayMs: AI_DELAY, firstMoveDelayMs: FIRST_DELAY, emptyRoomTtlMs: 1000, random: mulberry32(7) })
  })
  afterEach(() => vi.useRealTimers())

  function player(id: string) {
    const c = fakeClient()
    lobby.connect(id, c)
    return c
  }

  /** As the host: put a computer in every empty seat, then start. */
  function fillAndStart(hostId: string, host: ReturnType<typeof fakeClient>) {
    host.room!.seats.forEach((s, i) => {
      if (s.kind === 'open') lobby.handle(hostId, { t: 'setSeat', seat: i, kind: 'ai' })
    })
    lobby.handle(hostId, { t: 'start' })
  }

  it('only starts once every seat has a player or a computer', () => {
    const host = player('host-0001')
    lobby.handle('host-0001', { t: 'create', name: 'A' })
    lobby.handle('host-0001', { t: 'setSeat', seat: 1, kind: 'ai' })
    lobby.handle('host-0001', { t: 'start' })
    expect(host.errors.at(-1)).toMatch(/Fill every seat/)
    expect(host.room!.status).toBe('lobby')
    expect(host.game).toBeNull()

    fillAndStart('host-0001', host)
    expect(host.room!.status).toBe('playing')
    expect(host.room!.seats.map((s) => s.kind)).toEqual(['human', 'ai', 'ai', 'ai'])
  })

  it('creates a room and lets others join by code', () => {
    const host = player('host-0001')
    lobby.handle('host-0001', { t: 'create', name: '  Nam  ' })
    const code = host.room!.code
    expect(code).toMatch(/^[A-Z]{4}$/)
    expect(host.room!.seats[0]).toMatchObject({ kind: 'human', name: 'Nam', isHost: true, connected: true })

    const guest = player('guest-0001')
    lobby.handle('guest-0001', { t: 'join', code: code.toLowerCase(), name: 'Linh' })
    expect(guest.room!.you).toBe(1)
    expect(host.room!.seats[1]).toMatchObject({ kind: 'human', name: 'Linh', isHost: false })
  })

  it('rejects bad joins and non-host actions', () => {
    const host = player('host-0001')
    lobby.handle('host-0001', { t: 'create', name: 'A' })
    const guest = player('guest-0001')
    lobby.handle('guest-0001', { t: 'join', code: 'ZZZZ', name: 'B' })
    expect(guest.errors.at(-1)).toMatch(/No room/)
    lobby.handle('guest-0001', { t: 'join', code: host.room!.code, name: 'B' })
    lobby.handle('guest-0001', { t: 'start' })
    expect(guest.errors.at(-1)).toMatch(/Only the host/)
    lobby.handle('host-0001', { t: 'setSeat', seat: 1, kind: 'ai' })
    expect(host.errors.at(-1)).toMatch(/taken/)
    lobby.handle('host-0001', { t: 'setSeat', seat: '__proto__' as unknown as number, kind: 'ai' })
    expect(host.errors.at(-1)).toMatch(/No such seat/)
  })

  it('hides other hands and rotates each view', () => {
    const host = player('host-0001')
    lobby.handle('host-0001', { t: 'create', name: 'A' })
    const guest = player('guest-0001')
    lobby.handle('guest-0001', { t: 'join', code: host.room!.code, name: 'B' })
    fillAndStart('host-0001', host)

    expect(host.room!.seats.map((s) => s.kind)).toEqual(['human', 'human', 'ai', 'ai'])
    const hv = host.game!.state
    const gv = guest.game!.state
    expect(hv.hands[0]).toHaveLength(13)
    expect(hv.hands[1].every((c) => c.rank === -1)).toBe(true) // guest's cards are hidden from host
    expect(gv.hands[0].every((c) => c.rank >= 0)).toBe(true)
    expect(guest.game!.names[0]).toBe('B') // everyone sees themselves at seat 0
    expect(guest.game!.names[3]).toBe('A')
    expect((gv.turn + 1) % 4).toBe(hv.turn) // same turn, seen from one seat over
  })

  it('plays a full game: humans move by message, AI and disconnected humans move on timers', () => {
    const host = player('host-0001')
    lobby.handle('host-0001', { t: 'create', name: 'A' })
    const guest = player('guest-0001')
    lobby.handle('guest-0001', { t: 'join', code: host.room!.code, name: 'B' })
    fillAndStart('host-0001', host)

    const clients = { 'host-0001': host, 'guest-0001': guest }
    vi.advanceTimersByTime(FIRST_DELAY)
    for (let step = 0; step < 3000 && !isOver(host.game!.state); step++) {
      // Whoever's turn it is: if a human, answer like the AI would (seat 0 of their own view).
      for (const [id, c] of Object.entries(clients)) {
        const s = c.game!.state
        if (s.turn === 0 && !isOver(s)) {
          const move = chooseMove(s, 0)
          lobby.handle(id, move ? { t: 'play', cards: move } : { t: 'pass' })
          expect(c.errors).toEqual([])
        }
      }
      vi.advanceTimersByTime(AI_DELAY)
      if (step === 3) lobby.disconnect('guest-0001', guest) // a computer covers for the guest from now on
    }
    expect(isOver(host.game!.state)).toBe(true)
    expect(host.game!.state.finished).toHaveLength(4)
    expect(host.room!.seats[1].connected).toBe(false)
  })

  it('rejects out-of-turn and illegal plays', () => {
    const host = player('host-0001')
    lobby.handle('host-0001', { t: 'create', name: 'A' })
    fillAndStart('host-0001', host)
    const s = host.game!.state
    const not3Spades = s.hands[0].find((c) => !(c.rank === 0 && c.suit === 0))!
    lobby.handle('host-0001', { t: 'play', cards: [not3Spades] })
    // Either it isn't the host's turn, or it is but the first play must include 3♠.
    expect(host.errors.at(-1)).toMatch(s.turn === 0 ? /3♠/ : /Not your turn/)
    lobby.handle('host-0001', { t: 'play', cards: [{ rank: 99, suit: 0 }] })
    expect(host.errors.length).toBe(2)
  })

  it('hands seats to AI when a player leaves mid-game, and deletes empty rooms', () => {
    const host = player('host-0001')
    lobby.handle('host-0001', { t: 'create', name: 'A' })
    const guest = player('guest-0001')
    lobby.handle('guest-0001', { t: 'join', code: host.room!.code, name: 'B' })
    fillAndStart('host-0001', host)
    lobby.handle('host-0001', { t: 'leave' })
    expect(host.room).toBeNull()
    expect(guest.room!.seats[0]).toMatchObject({ kind: 'ai', name: 'A (AI)' })
    expect(guest.room!.seats[1].isHost).toBe(true) // host role passes on

    lobby.disconnect('guest-0001', guest)
    expect(lobby.roomCount).toBe(1)
    vi.advanceTimersByTime(1000)
    expect(lobby.roomCount).toBe(0)
  })

  it('lets a player reconnect and pick up where they were', () => {
    const host = player('host-0001')
    lobby.handle('host-0001', { t: 'create', name: 'A' })
    fillAndStart('host-0001', host)
    lobby.disconnect('host-0001', host)
    const again = player('host-0001')
    expect(again.room!.code).toBe(host.room!.code)
    expect(again.game!.state.hands[0].length).toBeGreaterThan(0)
  })
})
