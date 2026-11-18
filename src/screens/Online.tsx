// Online play: the room screen (seats, start) and the game itself, both driven by the server.

import { useEffect, useState } from 'react'
import { GameTable } from '../components/GameTable'
import type { ClientMessage, RoomInfo } from '../net/protocol.ts'
import { useServer } from '../net/useServer.ts'
import '../styles/lobby.css'

export function Online({ first, onExit }: { first?: ClientMessage; onExit(notice?: string): void }) {
  const { status, failedAttempts, room, game, error, clearError, send } = useServer(first)

  // The server says we're not in a room (we left, or it closed): back to the start screen.
  useEffect(() => {
    if (room === null) onExit(error ?? undefined)
  }, [room, error, onExit])

  // Errors fade after a few seconds.
  useEffect(() => {
    if (!error) return
    const t = setTimeout(clearError, 4000)
    return () => clearTimeout(t)
  }, [error, clearError])

  const leave = () => {
    if (status === 'open') send({ t: 'leave' })
    onExit()
  }

  const toast = error && room ? <div className="toast" role="alert">{error}</div> : null
  const offline = status !== 'open' && room ? <div className="toast" role="status">Reconnecting…</div> : null

  if (!room) {
    const stuck = failedAttempts >= 2
    return (
      <main className="lobby">
        <section className="panel">
          <p>{stuck ? "Can't reach the game server." : 'Connecting…'}</p>
          {stuck && (
            <p className="muted-light">
              Make sure it's running: <code>npm run server</code>
            </p>
          )}
          <button type="button" onClick={() => onExit()}>Back</button>
        </section>
      </main>
    )
  }

  if (room.status === 'lobby' || !game) {
    return (
      <>
        <RoomScreen room={room} send={send} onLeave={leave} />
        {toast}
        {offline}
      </>
    )
  }

  const isHost = room.seats[room.you].isHost
  const hostName = room.seats.find((s) => s.isHost)?.name ?? 'the host'
  // room.seats is in table order; the game view is rotated so you're seat 0.
  const away = game.names.map((_, i) => {
    const s = room.seats[(i + room.you) % room.seats.length]
    return s.kind === 'human' && !s.connected
  })

  return (
    <>
      <GameTable
        key={game.dealId}
        game={game.state}
        names={game.names}
        away={away}
        onPlay={(cards) => send({ t: 'play', cards })}
        onPass={() => send({ t: 'pass' })}
        onAgain={isHost ? () => send({ t: 'start' }) : undefined}
        againNote={`Waiting for ${hostName} to deal again…`}
        header={
          <>
            <button type="button" onClick={leave}>Leave</button>
            <span className="header-title">Room {room.code}</span>
            <span />
          </>
        }
      />
      {toast}
      {offline}
    </>
  )
}

function RoomScreen({ room, send, onLeave }: {
  room: RoomInfo
  send(msg: ClientMessage): void
  onLeave(): void
}) {
  const [copied, setCopied] = useState(false)
  const me = room.seats[room.you]
  const host = room.seats.find((s) => s.isHost)
  const openSeats = room.seats.filter((s) => s.kind === 'open').length

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(room.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable: the code is on screen */
    }
  }

  return (
    <main className="lobby">
      <section className="panel">
        <p className="eyebrow">Room code</p>
        <div className="code-row">
          <span className="room-code">{room.code}</span>
          <button type="button" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        </div>
        <p className="muted-light">Share this code so friends can join.</p>

        <ol className="seats">
          {room.seats.map((s, i) => (
            <li key={i} className={`seat-row ${s.kind}`}>
              <span className="seat-num">{i + 1}</span>
              <span className="seat-name">
                {s.kind === 'open' ? 'Waiting for player…' : s.name}
                {i === room.you && <span className="tag">You</span>}
                {s.isHost && <span className="tag host">Host</span>}
                {s.kind === 'ai' && <span className="tag">Computer</span>}
                {s.kind === 'human' && !s.connected && <span className="tag away">Away</span>}
              </span>
              {me.isHost && s.kind !== 'human' && (
                <button
                  type="button"
                  className="small"
                  onClick={() => send({ t: 'setSeat', seat: i, kind: s.kind === 'ai' ? 'open' : 'ai' })}
                >
                  {s.kind === 'ai' ? 'Remove' : 'Add computer'}
                </button>
              )}
            </li>
          ))}
        </ol>

        <div className="panel-actions">
          <button type="button" onClick={onLeave}>Leave</button>
          {me.isHost ? (
            <button type="button" className="primary" onClick={() => send({ t: 'start' })} disabled={openSeats > 0}>
              Start game
            </button>
          ) : (
            <span className="muted-light">
              {openSeats > 0 ? 'Waiting for players…' : `Waiting for ${host?.name ?? 'the host'} to start…`}
            </span>
          )}
        </div>
        {me.isHost && openSeats > 0 && (
          <p className="muted-light">
            {openSeats === 1 ? '1 seat is' : `${openSeats} seats are`} empty. Wait for friends to join, or add computers, to start.
          </p>
        )}
      </section>
    </main>
  )
}
