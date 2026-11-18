# Card art

**"Bridge-Sized Playing Card Deck (PNG, CC0)"** by **Mesmedir**, from OpenGameArt.org:
https://opengameart.org/content/bridge-sized-playing-card-deck-png-cc0

Based on the 2017 English pattern playing card deck by **Dmitry Fomin** on Wikimedia Commons:
https://commons.wikimedia.org/wiki/Category:SVG_English_pattern_playing_cards

Both are released under **CC0 1.0** (public domain dedication): free to use, change and
share for any purpose, with no attribution required. This credit is a courtesy.
https://creativecommons.org/publicdomain/zero/1.0/

## Files and changes

`cards/` holds the original deck from `playingcards_bridgesize_png.zip` (486×757 PNGs).
`scripts/resize-cards.py` shrinks them, unchanged otherwise, into the copies the game loads
from `public/cards/<width>/`. The originals stay here, outside `public/`, so they aren't shipped.

File names: `<suit>-<number>.png`, suit C/D/H/S, number 1 = ace, 2–10, 11 = J, 12 = Q, 13 = K.
`Back-R.png` is the card back used in the game. `Back-B.png` and the jokers (`X-R.png`, `X-B.png`)
are unused; Tiến Lên has no jokers.
