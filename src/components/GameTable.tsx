// The game screen: table, seats, your hand and buttons. It only displays a game and
// reports what you click; LocalGame (vs computer) and OnlineGame (via the server)
// decide what happens next. Seat 0 is always you, at the bottom.
//
// Render it with key={dealId} so a new deal starts fresh (shuffle animation, no selection).

import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react'
import { CardFace } from './CardFace'
import { type Card, RANK_TWO, cardId } from '../game/cards.ts'
import { COMBO_LABELS, classify, isBomb } from '../game/combos.ts'
import { type GameState, canPass, isOver, notStarted, ordinal, placeOf, tableTop, validatePlay } from '../game/engine.ts'
import { DEAL_FLIGHT_MS, DEAL_MS, DEAL_STAGGER_MS, SHUFFLE_MS } from '../game/timing.ts'
import { playSound, setMuted, useMuted } from './sounds'
import '../styles/table.css'

type Phase = 'shuffling' | 'dealing' | 'playing'

const ME = 0
// Seat index → side of the table. Turn order (index + 1) runs counter-clockwise.
const SEATS = ['bottom', 'right', 'top', 'left'] as const

interface Props {
  game: GameState
  names: string[] // names[0] is you
  away?: boolean[] // seats whose player disconnected (a computer covers for them)
  onPlay(cards: Card[]): void
  onPass(): void
  onAgain?: () => void // "Play again" once everyone has a place; omit to show `againNote` instead
  againNote?: string
  header: { left: ReactNode; title: ReactNode; right?: ReactNode } // the mute button is added on the right
}

const displayName = (names: string[], seat: number) => (seat === ME ? 'You' : names[seat])

function Opponent({ seat, game, phase, names, away }: {
  seat: number
  game: GameState
  phase: Phase
  names: string[]
  away?: boolean
}) {
  const count = phase === 'playing' ? game.hands[seat].length : 0
  const active = phase === 'playing' && !isOver(game) && game.turn === seat
  const place = placeOf(game, seat)
  return (
    <div className={`seat seat-${SEATS[seat]} ${active ? 'active' : ''}`}>
      <div className="seat-info">
        <strong>{names[seat]}</strong>
        {place !== null && <span className="badge place">{ordinal(place)}</span>}
        {away && <span className="badge away">Away</span>}
        {place === null && game.passed[seat] && <span className="badge">Pass</span>}
      </div>
      {/* Cards fanned like a held hand, rotated so they point at the table. */}
      <div className="fan-box" aria-hidden>
        <div className="fan" style={{ '--n': count } as CSSProperties}>
          {Array.from({ length: count }, (_, i) => (
            <div key={i} className="back small" style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
      </div>
    </div>
  )
}

function ShuffleDeck() {
  return (
    <div className="shuffle" aria-label="Shuffling">
      {Array.from({ length: 14 }, (_, i) => (
        <div key={i} className="back" style={{ '--i': i } as CSSProperties} />
      ))}
    </div>
  )
}

function DealFlight({ starter }: { starter: number }) {
  return (
    <div className="deal" aria-label="Dealing">
      {Array.from({ length: 52 }, (_, i) => (
        <div
          key={i}
          className={`back to-${SEATS[(starter + i) % 4]}`}
          style={{ animationDelay: `${i * DEAL_STAGGER_MS}ms`, animationDuration: `${DEAL_FLIGHT_MS}ms` }}
        />
      ))}
    </div>
  )
}

/** Flash, shockwave and sparks over the table. Pure CSS: it plays once when mounted. */
function BombBurst() {
  return (
    <div className="bomb-fx" aria-hidden>
      <div className="bomb-flash" />
      <div className="bomb-ring" />
      <div className="bomb-ring second" />
      {Array.from({ length: 14 }, (_, i) => (
        <span key={i} className="bomb-spark" style={{ '--a': `${(i * 360) / 14 + (i % 2) * 9}deg`, '--d': `${90 + (i % 3) * 35}px` } as CSSProperties} />
      ))}
    </div>
  )
}

const SHAKE: Keyframe[] = [
  { transform: 'translate(0, 0)' },
  { transform: 'translate(-7px, 4px) rotate(-0.4deg)' },
  { transform: 'translate(6px, -5px) rotate(0.4deg)' },
  { transform: 'translate(-5px, -3px)' },
  { transform: 'translate(4px, 4px)' },
  { transform: 'translate(-2px, 1px)' },
  { transform: 'translate(0, 0)' },
]

function Pile({ game, names }: { game: GameState; names: string[] }) {
  const top = tableTop(game)
  return (
    <>
      {/* The current play, plus the one it beat lying underneath so the new cards land on top of it.
          Keyed by id: only a newly added play runs the fly-in animation. */}
      <div className="pile">
        {game.pile.slice(-2).map((p) => (
          <div
            key={p.id}
            className={`play from-${SEATS[p.by]} ${p === top ? '' : 'under'} ${isBomb(p.combo) ? 'bomb' : ''}`}
            style={{ '--count': p.combo.cards.length } as CSSProperties}
          >
            {p.combo.cards.map((c) => <CardFace key={cardId(c)} card={c} />)}
          </div>
        ))}
      </div>
      {!isOver(game) && (
        <p className="pile-caption">
          {top
            ? `${displayName(names, top.by)} · ${COMBO_LABELS[top.combo.type]}`
            : `${displayName(names, game.turn)} ${game.turn === ME ? 'lead' : 'leads'}${game.firstPlay ? ' (must include 3♠)' : ''}`}
        </p>
      )}
    </>
  )
}

function MuteButton() {
  const muted = useMuted()
  return (
    <button
      type="button"
      className="icon-button"
      onClick={() => setMuted(!muted)}
      aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
      title={muted ? 'Sound off' : 'Sound on'}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  )
}

export function GameTable({ game, names, away, onPlay, onPass, onAgain, againNote, header }: Props) {
  // A game already under way (e.g. after reconnecting) skips the shuffle/deal animation.
  const [phase, setPhase] = useState<Phase>(() => (notStarted(game) ? 'shuffling' : 'playing'))
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Sounds: the shuffle when a deal starts, then a card (or bomb) sound for each new play.
  // Refs remember what we've already played a sound for, so re-renders don't repeat it,
  // and plays made before this screen opened (e.g. after reconnecting) stay quiet.
  const top = tableTop(game)
  const soundedPlay = useRef(top?.id ?? null)
  const [firstSeenPlay] = useState(() => top?.id ?? null) // a bomb already on the table when this opened isn't replayed
  const boardRef = useRef<HTMLDivElement>(null)
  const soundedShuffle = useRef(false)
  useEffect(() => {
    if (phase === 'shuffling' && !soundedShuffle.current) {
      soundedShuffle.current = true
      playSound('shuffle')
    }
  }, [phase])
  useEffect(() => {
    if (!top || top.id === soundedPlay.current) return
    soundedPlay.current = top.id
    const bomb = isBomb(top.combo)
    playSound(bomb ? 'bomb' : 'play')
    // Shake the table as the bomb lands (the cards' slam animation hits at ~0.3s).
    if (bomb) boardRef.current?.animate(SHAKE, { duration: 450, delay: 280, easing: 'ease-out' })
  }, [top])
  const showBomb = phase === 'playing' && top !== null && isBomb(top.combo) && top.id !== firstSeenPlay

  // Shuffle → deal → play.
  useEffect(() => {
    if (phase === 'playing') return
    const t = setTimeout(() => setPhase(phase === 'shuffling' ? 'dealing' : 'playing'), phase === 'shuffling' ? SHUFFLE_MS : DEAL_MS)
    return () => clearTimeout(t)
  }, [phase])

  const myHand = game.hands[ME]
  const picked = myHand.filter((c) => selected.has(cardId(c)))
  const myTurn = phase === 'playing' && !isOver(game) && game.turn === ME
  const myPlace = placeOf(game, ME)
  const error = validatePlay(game, ME, picked)

  const toggle = (c: Card) =>
    setSelected((prev) => {
      const next = new Set(prev)
      const id = cardId(c)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const doPlay = () => {
    if (!myTurn || error) return
    onPlay(picked)
    setSelected(new Set())
  }

  const doPass = () => {
    if (!myTurn || !canPass(game, ME)) return
    onPass()
    setSelected(new Set())
  }

  let hint: string
  if (phase !== 'playing') hint = phase === 'shuffling' ? 'Shuffling…' : 'Dealing…'
  else if (game.instantWin !== null)
    hint = game.instantWin === ME ? 'You won with four 2s!' : `${names[game.instantWin]} won with four 2s`
  else if (isOver(game)) hint = myPlace === 1 ? 'You won!' : `You came ${ordinal(myPlace!)}`
  else if (myPlace !== null) hint = `You finished ${ordinal(myPlace)}! Watching the others…`
  else if (!myTurn) hint = `${names[game.turn]} is thinking…`
  else if (picked.length === 0) hint = canPass(game, ME) ? 'Your turn: beat the table or pass' : 'Your turn: lead any combination'
  else hint = error ?? `${COMBO_LABELS[classify(picked)!.type]} — ready to play`

  return (
    <main className="game">
      <header>
        <div className="header-side">{header.left}</div>
        <span className="header-title">{header.title}</span>
        <div className="header-side end">
          {header.right}
          <MuteButton />
        </div>
      </header>

      <div className="board" ref={boardRef}>
        {[2, 3, 1].map((seat) => (
          <Opponent key={seat} seat={seat} game={game} phase={phase} names={names} away={away?.[seat]} />
        ))}

        <div className="center">
          {phase === 'shuffling' && <ShuffleDeck />}
          {phase === 'dealing' && <DealFlight starter={game.turn} />}
          {phase === 'playing' && <Pile game={game} names={names} />}
          {/* keyed by the play, so each new bomb restarts the burst */}
          {showBomb && <BombBurst key={top.id} />}
          {phase === 'playing' && isOver(game) && (
            <div className="result">
              {game.instantWin !== null ? (
                <>
                  <strong>{game.instantWin === ME ? 'You win!' : `${names[game.instantWin]} wins!`}</strong>
                  <span className="muted-light">
                    {game.instantWin === ME ? 'You were' : `${names[game.instantWin]} was`} dealt all four 2s
                  </span>
                  <div className="four-twos" aria-label="Four 2s">
                    {[0, 1, 2, 3].map((suit) => (
                      <CardFace key={suit} card={{ rank: RANK_TWO, suit }} />
                    ))}
                  </div>
                </>
              ) : (
                <strong>{myPlace === 1 ? 'You win!' : `You came ${ordinal(myPlace!)}`}</strong>
              )}
              {game.instantWin === null && <ol className="standings">
                {game.finished.map((seat, i) => (
                  <li key={seat} className={seat === ME ? 'me' : ''}>
                    <span className="standing-place">{ordinal(i + 1)}</span>
                    <span>{displayName(names, seat)}</span>
                  </li>
                ))}
              </ol>}
              {onAgain ? (
                <button type="button" onClick={onAgain}>Play again</button>
              ) : (
                againNote && <span className="muted-light">{againNote}</span>
              )}
            </div>
          )}
        </div>

        <div className={`seat seat-bottom ${myTurn ? 'active' : ''}`}>
          <div className="seat-info">
            <strong>You</strong>
            {myPlace !== null && <span className="badge place">{ordinal(myPlace)}</span>}
            {myPlace === null && game.passed[ME] && <span className="badge">Pass</span>}
          </div>
          <div className="hand">
            {phase === 'playing' &&
              myHand.map((c, i) => (
                <CardFace
                  key={cardId(c)}
                  card={c}
                  selected={selected.has(cardId(c))}
                  onClick={() => toggle(c)}
                  style={{ animationDelay: `${i * 40}ms` }}
                />
              ))}
          </div>
          <p className={`hint ${myTurn && picked.length > 0 && !error ? 'ok' : ''}`} aria-live="polite">{hint}</p>
          <div className="actions">
            <button type="button" className="primary" onClick={doPlay} disabled={!myTurn || !!error}>Play</button>
            <button type="button" onClick={doPass} disabled={!myTurn || !canPass(game, ME)}>Pass</button>
            <button type="button" onClick={() => setSelected(new Set())} disabled={selected.size === 0}>Clear</button>
          </div>
        </div>
      </div>
    </main>
  )
}
