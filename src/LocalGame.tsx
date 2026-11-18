// Offline game: you against three computer players, all in the browser.

import { useEffect, useState } from 'react'
import { GameTable } from './GameTable'
import { chooseMove } from './game/ai.ts'
import { type GameState, isOver, newGame, pass, play } from './game/engine.ts'
import { AI_DELAY_MS, FIRST_MOVE_DELAY_MS } from './timing.ts'

const ME = 0
const NAMES = ['You', 'East', 'North', 'West']

export function LocalGame({ onExit }: { onExit(): void }) {
  const [game, setGame] = useState<GameState>(() => newGame())
  const [dealId, setDealId] = useState(0)

  // Computer players take their turn after a short pause (longer right after the deal).
  useEffect(() => {
    if (isOver(game) || game.turn === ME) return
    const fresh = game.firstPlay && game.pile.length === 0
    const t = setTimeout(() => {
      setGame((g) => {
        if (isOver(g) || g.turn === ME) return g
        const move = chooseMove(g, g.turn)
        return move ? play(g, g.turn, move) : pass(g, g.turn)
      })
    }, fresh ? FIRST_MOVE_DELAY_MS : AI_DELAY_MS)
    return () => clearTimeout(t)
  }, [game])

  const redeal = () => {
    setGame(newGame())
    setDealId((n) => n + 1)
  }

  return (
    <GameTable
      key={dealId}
      game={game}
      names={NAMES}
      onPlay={(cards) => setGame((g) => play(g, ME, cards))}
      onPass={() => setGame((g) => pass(g, ME))}
      onAgain={redeal}
      header={
        <>
          <button type="button" onClick={onExit}>← Lobby</button>
          <span className="header-title">Vs computer</span>
          {/* New game only once everyone has a place, like the result screen's Play again */}
          {isOver(game) ? <button type="button" onClick={redeal}>New game</button> : <span />}
        </>
      }
    />
  )
}
