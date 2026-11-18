// Game server: WebSocket endpoint at /ws for rooms and online games.
// In production it also serves the built site from dist/ (run `npm run build` first).
//
//   npm run server        start it (port 3001, or $PORT)
//
// During development, run it next to `npm run dev`; Vite forwards /ws here (see vite.config.ts).

import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { WebSocketServer, type WebSocket } from 'ws'
import type { ClientMessage, ServerMessage } from '../src/net/protocol.ts'
import { type Client, Lobby } from './lobby.ts'

const PORT = Number(process.env.PORT ?? 3001)
const DIST = resolve(import.meta.dirname, '..', 'dist')

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.md': 'text/markdown; charset=utf-8',
}

const server = createServer((req, res) => {
  if (!existsSync(DIST)) {
    res.writeHead(404, { 'content-type': 'text/plain' })
    return res.end('Game server is running. Build the site with `npm run build`, or use `npm run dev` during development.')
  }
  const url = new URL(req.url ?? '/', 'http://localhost')
  let file = normalize(join(DIST, decodeURIComponent(url.pathname)))
  if (!file.startsWith(DIST + sep) && file !== DIST) {
    res.writeHead(403)
    return res.end()
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html')
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(res)
})

const lobby = new Lobby()
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 })

wss.on('connection', (ws: WebSocket & { alive?: boolean }) => {
  let playerId: string | null = null
  const client: Client = {
    send: (msg: ServerMessage) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
    },
  }
  ws.alive = true
  ws.on('pong', () => (ws.alive = true))

  ws.on('message', (raw) => {
    let msg: ClientMessage
    try {
      msg = JSON.parse(String(raw))
    } catch {
      return
    }
    if (playerId === null) {
      // The first message must say who this is (a random id the browser keeps).
      if (msg?.t !== 'hello' || typeof msg.id !== 'string' || !/^[\w-]{8,64}$/.test(msg.id)) return ws.close()
      playerId = msg.id
      lobby.connect(playerId, client)
      return
    }
    lobby.handle(playerId, msg)
  })

  ws.on('close', () => {
    if (playerId) lobby.disconnect(playerId, client)
  })
})

// Drop connections that stopped answering (closed laptop, lost Wi-Fi).
setInterval(() => {
  for (const ws of wss.clients as Set<WebSocket & { alive?: boolean }>) {
    if (!ws.alive) ws.terminate()
    ws.alive = false
    ws.ping()
  }
}, 30_000)

server.listen(PORT, () => {
  console.log(`Tiến Lên server on http://localhost:${PORT} (WebSocket at /ws)`)
})
