import { type Card, RANKS } from '../game/cards.ts'

// Card art is pre-shrunk by scripts/resize-cards.py into public/cards/<width>/,
// named <suit>-<number>.png: suit C/D/H/S, number 1 = ace, 2–10, 11 = J, 12 = Q, 13 = K.
// The browser picks the width that matches the card's on-screen size and pixel density.
// See art/CREDITS.md.
const SUIT_CODES = ['S', 'C', 'D', 'H'] // same order as SUITS in game/cards.ts
const FILE_NUMBER: Record<string, number> = { A: 1, J: 11, Q: 12, K: 13 }
const WIDTHS = [32, 40, 64, 80, 128, 256]

const base = `${import.meta.env.BASE_URL}cards/`

/** Card widths on screen; keep in sync with --card-w in styles/table.css. */
export const CARD_SIZES = '(max-width: 600px) 40px, 64px'

const fileName = (card: Card) => {
  const rank = RANKS[card.rank]
  return `${SUIT_CODES[card.suit]}-${FILE_NUMBER[rank] ?? Number(rank)}.png`
}

const srcSetFor = (file: string) => WIDTHS.map((w) => `${base}${w}/${file} ${w}w`).join(', ')

export const cardSrc = (card: Card) => `${base}64/${fileName(card)}`
export const cardSrcSet = (card: Card) => srcSetFor(fileName(card))

/** Fetch every card image up front (at the size this screen needs) so nothing pops in mid-game. */
export function preloadCardImages(cards: Card[]) {
  for (const file of [...cards.map(fileName), 'Back-R.png']) {
    const img = new Image()
    img.sizes = CARD_SIZES
    img.srcset = srcSetFor(file)
    img.src = `${base}64/${file}`
  }
}
