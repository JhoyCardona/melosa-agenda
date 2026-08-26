import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves this project at github.io/melosa-agenda/, not at the
  // domain root, so every asset URL needs that prefix baked in at build time.
  base: '/melosa-agenda/',
  plugins: [react()],
})
