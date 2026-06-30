import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `base` is conditional: GitHub Pages serves the app under /Roadmap/, but local
// dev/preview must stay at root. Only the production build gets the subpath.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Roadmap_advanced/' : '/',
  plugins: [react()],
  server: {
    port: 5173,
  },
}))
