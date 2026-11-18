# Card art

`cards/` holds the original card deck (from `playingcards_bridgesize_png.zip`, 486×757 PNGs).
It's the source for `scripts/resize-cards.py`, which writes the sized copies the game
actually loads into `public/cards/<width>/`. The originals stay here, outside `public/`,
so they aren't shipped with the site.

- Source: _TODO: add where this deck came from_
- License: _TODO: confirm the license allows use in this game_

File names: `<suit>-<number>.png`, suit C/D/H/S, number 1 = ace, 2–10, 11 = J, 12 = Q, 13 = K.
`Back-R.png` is the card back used in the game. `Back-B.png` and the jokers (`X-R.png`, `X-B.png`)
are unused; Tiến Lên has no jokers.
