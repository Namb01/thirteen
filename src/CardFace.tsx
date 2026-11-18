import type { CSSProperties } from 'react'
import { CARD_SIZES, cardSrc, cardSrcSet } from './cardArt'
import { type Card, RANKS, SUITS, cardId, isRed } from './game/cards'

export function CardFace({ card, selected, onClick, style }: {
  card: Card
  selected?: boolean
  onClick?: () => void
  style?: CSSProperties
}) {
  return (
    <button
      type="button"
      className={`card ${selected ? 'selected' : ''}`}
      onClick={onClick}
      disabled={!onClick}
      aria-pressed={onClick ? selected : undefined}
      aria-label={cardId(card)}
      style={style}
    >
      <img src={cardSrc(card)} srcSet={cardSrcSet(card)} sizes={CARD_SIZES} alt="" draggable={false} />
      {/* Larger corner index, shown only on small screens where the printed one is too tiny. */}
      <span className={`index ${isRed(card) ? 'red' : ''}`} aria-hidden>
        <b>{RANKS[card.rank]}</b>
        <span>{SUITS[card.suit]}</span>
      </span>
    </button>
  )
}
