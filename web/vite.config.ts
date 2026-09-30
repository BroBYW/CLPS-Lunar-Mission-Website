import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  // Pre-bundle everything up front so the dev server never re-optimizes mid-session
  optimizeDeps: {
    include: ['react', 'react-dom/client', 'zustand', 'comlink', 'd3-scale', 'd3-time-format'],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
