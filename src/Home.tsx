// Start screen: pick a name, then create a room, join one by code, or play offline.

import { type FormEvent, useState } from 'react'
import { MAX_NAME_LENGTH, ROOM_CODE_LENGTH } from './net/protocol.ts'

const NAME_KEY = 'tienlen.name'

function savedName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export function Home({ notice, onCreate, onJoin, onLocal }: {
  notice?: string
  onCreate(name: string): void
  onJoin(code: string, name: string): void
  onLocal(): void
}) {
  const [name, setName] = useState(savedName)
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '')

  const finalName = () => {
    const n = name.trim() || 'Player'
    try {
      localStorage.setItem(NAME_KEY, n)
    } catch {
      /* storage unavailable */
    }
    return n
  }

  const join = (e: FormEvent) => {
    e.preventDefault()
    if (code.length === ROOM_CODE_LENGTH) onJoin(code, finalName())
  }

  return (
    <main className="lobby">
      <section className="panel">
        <h1 className="logo">Thirteen</h1>

        <label className="field">
          <span>Your name</span>
          <input
            value={name}
            maxLength={MAX_NAME_LENGTH}
            placeholder="Player"
            autoComplete="nickname"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <button type="button" className="primary" onClick={() => onCreate(finalName())}>Create room</button>

        <form className="join-row" onSubmit={join}>
          <input
            aria-label="Room code"
            value={code}
            maxLength={ROOM_CODE_LENGTH}
            placeholder="Room code"
            autoCapitalize="characters"
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
          />
          <button type="submit" disabled={code.length !== ROOM_CODE_LENGTH}>Join</button>
        </form>

        <div className="divider"><span>or</span></div>

        <button type="button" onClick={onLocal}>Play vs computer</button>

        {notice && <p className="notice" role="alert">{notice}</p>}
      </section>
    </main>
  )
}
