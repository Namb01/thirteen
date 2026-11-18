// Top level: start screen → offline game or online room.

import { useCallback, useEffect, useState } from 'react'
import { Home } from './Home'
import { LocalGame } from './LocalGame'
import { Online } from './Online'
import { preloadCardImages } from './cardArt'
import { createDeck } from './game/cards.ts'
import type { ClientMessage } from './net/protocol.ts'
import './App.css'

type Screen = { kind: 'home'; notice?: string } | { kind: 'local' } | { kind: 'online'; first?: ClientMessage }

// Remember (per tab) that we're online, so a reload reconnects to the same room.
const ONLINE_KEY = 'tienlen.online'
const setOnlineFlag = (on: boolean) => {
  try {
    if (on) sessionStorage.setItem(ONLINE_KEY, '1')
    else sessionStorage.removeItem(ONLINE_KEY)
  } catch {
    /* storage unavailable */
  }
}
const initialScreen = (): Screen => {
  try {
    if (sessionStorage.getItem(ONLINE_KEY)) return { kind: 'online' }
  } catch {
    /* storage unavailable */
  }
  return { kind: 'home' }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(initialScreen)

  // Fetch all card art once so nothing pops in during the deal.
  useEffect(() => preloadCardImages(createDeck()), [])

  const goOnline = (first: ClientMessage) => {
    setOnlineFlag(true)
    setScreen({ kind: 'online', first })
  }
  const exitOnline = useCallback((notice?: string) => {
    setOnlineFlag(false)
    setScreen({ kind: 'home', notice })
  }, [])

  switch (screen.kind) {
    case 'local':
      return <LocalGame onExit={() => setScreen({ kind: 'home' })} />
    case 'online':
      return <Online first={screen.first} onExit={exitOnline} />
    default:
      return (
        <Home
          notice={screen.notice}
          onCreate={(name) => goOnline({ t: 'create', name })}
          onJoin={(code, name) => goOnline({ t: 'join', code, name })}
          onLocal={() => setScreen({ kind: 'local' })}
        />
      )
  }
}
