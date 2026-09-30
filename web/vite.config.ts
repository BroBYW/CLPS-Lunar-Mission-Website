import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// CesiumJS loads workers and assets at runtime from CESIUM_BASE_URL (see src/main.tsx)
const cesium = 'node_modules/cesium/Build/Cesium'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: ['Workers', 'Assets', 'ThirdParty', 'Widgets'].map((d) => ({ src: `${cesium}/${d}`, dest: 'cesiumStatic' })),
    }),
  ],
  worker: { format: 'es' },
  // Pre-bundle everything up front so the dev server never re-optimizes mid-session
  optimizeDeps: {
    include: ['react', 'react-dom/client', 'zustand', 'comlink', 'd3-scale', 'd3-time-format', 'cesium'],
  },
  build: {
    chunkSizeWarningLimit: 6000, // the lazy Cesium chunk; the entry chunk stays under 100 kB gzip
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
