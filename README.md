# Tiến Lên (Thirteen)

A browser card game for the vietnamese card game Tiến Lên!

## Run it locally

Two terminals

```bash
npm run server   # game server for online rooms, http://localhost:3001 (WebSocket /ws)
npm run dev      # the site, http://localhost:5173 (forwards /ws to the server)
```

## Production

```bash
npm run build    # builds the site into dist/
npm start        # one server for both the site and the game (PORT env var, default 3001)
```

## Checks

```bash
npm test         # rules, AI and lobby tests
npm run lint
npm run build    # also type-checks
```

## Credits

Card art: [Bridge-Sized Playing Card Deck](https://opengameart.org/content/bridge-sized-playing-card-deck-png-cc0) by Mesmedir,
based on Dmitry Fomin's English pattern deck from Wikimedia Commons. Both CC0 (public domain). Details in [art/CREDITS.md](art/CREDITS.md).
