import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // Vite 8 (Rolldown) replaces manualChunks with advancedChunks.
        advancedChunks: {
          groups: [
            { name: 'three', test: /[\\/]node_modules[\\/](three|postprocessing)[\\/]/ },
            { name: 'r3f', test: /[\\/]node_modules[\\/]@react-three[\\/]/ },
          ],
        },
      },
    },
  },
  server: {
    // `pnpm dev:edge` serves the API on 8787; the viewer dev server proxies to it.
    proxy: {
      '/api': { target: 'http://localhost:8787', ws: true },
      '/badge': 'http://localhost:8787',
      '/s': 'http://localhost:8787',
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
