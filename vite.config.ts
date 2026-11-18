import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Forward game-server traffic to `npm run server` (port 3001) during development.
    proxy: { '/ws': { target: 'ws://localhost:3001', ws: true } },
    // In WSL on a Windows folder (/mnt/c/...), file-change events from Windows don't arrive,
    // so check for changes by polling instead. Elsewhere, use normal (faster) file watching.
    watch: { usePolling: process.platform === 'linux' && process.cwd().startsWith('/mnt/') },
  },
})
