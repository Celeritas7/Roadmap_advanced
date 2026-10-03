// V2-Q — FULL REPLACEMENT for vite.config.ts
// Delta: __BUILD_ID__ (AKATSUKI.md: show the build id in the UI and in the
// first [ak] log line). Minted per dev-server start / per build.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const BUILD_ID = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')

// `base` is conditional: GitHub Pages serves the app under /Roadmap_advanced/,
// but local dev/preview must stay at root. Only the production build gets the subpath.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Roadmap_advanced/' : '/',
  plugins: [react()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  server: {
    port: 5173,
  },
}))
