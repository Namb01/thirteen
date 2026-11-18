// Connection to the game server. Reconnects on its own and re-identifies with the same
// player id, so a reload or a dropped connection puts you back in your room.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClientMessage, GameView, RoomInfo, ServerMessage } from './protocol.ts'

export type ConnectionStatus = 'connecting' | 'open' | 'closed'

// One id per browser tab (sessionStorage), so two tabs can be two different players.
const ID_KEY = 'tienlen.playerId'
function playerId(): string {
  try {
    let id = sessionStorage.getItem(ID_KEY)
    if (!id) {
      id = crypto.randomUUID()
      sessionStorage.setItem(ID_KEY, id)
    }
    return id
  } catch {
    return (window as { __tienlenId?: string }).__tienlenId ??= crypto.randomUUID()
  }
}

const serverUrl = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`

/**
 * @param firstMessage sent once, right after the first successful connection (e.g. create/join).
 */
export function useServer(firstMessage?: ClientMessage) {
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [room, setRoom] = useState<RoomInfo | null | undefined>(undefined) // undefined = not heard yet
  const [game, setGame] = useState<GameView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const firstRef = useRef(firstMessage)
  // While the first message (create/join) is in flight, the server may still report
  // "no room" from before it handled it; ignore that, and treat an error as "couldn't get in".
  const awaitingRef = useRef(false)

  useEffect(() => {
    let stopped = false
    let retry: ReturnType<typeof setTimeout> | undefined
    let attempt = 0

    const connect = () => {
      const ws = new WebSocket(serverUrl())
      wsRef.current = ws
      setStatus('connecting')
      ws.onopen = () => {
        attempt = 0
        setFailedAttempts(0)
        setStatus('open')
        ws.send(JSON.stringify({ t: 'hello', id: playerId() } satisfies ClientMessage))
        if (firstRef.current) {
          ws.send(JSON.stringify(firstRef.current))
          firstRef.current = undefined
          awaitingRef.current = true
        }
      }
      ws.onmessage = (e) => {
        let msg: ServerMessage
        try {
          msg = JSON.parse(e.data)
        } catch {
          return
        }
        if (msg.t === 'room') {
          if (msg.room === null && awaitingRef.current) return
          if (msg.room) awaitingRef.current = false
          setRoom(msg.room)
        } else if (msg.t === 'game') {
          setGame(msg.game)
        } else if (msg.t === 'error') {
          setError(msg.message)
          if (awaitingRef.current) {
            awaitingRef.current = false
            setRoom(null) // e.g. "No room with code ABCD": back to the start screen with the message
          }
        }
      }
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null
        setStatus('closed')
        if (stopped) return
        attempt++
        setFailedAttempts(attempt)
        retry = setTimeout(connect, Math.min(500 * 2 ** attempt, 8000))
      }
    }

    connect()
    return () => {
      stopped = true
      clearTimeout(retry)
      wsRef.current?.close()
    }
  }, [])

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
    else setError('Not connected to the server')
  }, [])

  const clearError = useCallback(() => setError(null), [])

  return { status, failedAttempts, room, game, error, clearError, send }
}
