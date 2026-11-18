# Tiến Lên (Thirteen)

A browser card game: play against computer players, or with friends in an online room.

## Run it locally

Two terminals (on Windows PowerShell, use `npm.cmd` instead of `npm` if scripts are blocked):

```bash
npm run server   # game server for online rooms, http://localhost:3001 (WebSocket /ws)
npm run dev      # the site, http://localhost:5173 (forwards /ws to the server)
```

"Play vs computer" works without the server; creating or joining a room needs it.
To try multiplayer alone, open the site in two browser tabs: each tab is a separate player.

## Production

```bash
npm run build    # builds the site into dist/
npm start        # one server for both the site and the game (PORT env var, default 3001)
```

## Project layout

- `src/game/`: rules engine (cards, combinations, turns) and the computer player. Shared by browser and server.
- `src/net/protocol.ts`: messages between browser and server.
- `server/`: rooms and online games (`lobby.ts`) and the WebSocket/HTTP server (`index.ts`).
- `src/`: React screens: `Home` (start screen), `Online` (room + online game), `LocalGame`, `GameTable`.
- `public/cards/`: card images; `scripts/resize-cards.py` regenerates the sized copies.

## Checks

```bash
npm test         # rules, AI and lobby tests
npm run lint
npm run build    # also type-checks
```
