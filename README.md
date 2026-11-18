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
