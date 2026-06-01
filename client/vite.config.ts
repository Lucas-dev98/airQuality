import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.png'],
      manifest: {
        name: 'Condicoes Climaticas Atuais',
        short_name: 'Clima',
        description: 'Clima, previsao e qualidade do ar com suporte offline.',
        theme_color: '#0f766e',
        background_color: '#0f3339',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icon.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('mapbox-gl') || id.includes('@mapbox/mapbox-gl-draw')) {
            return 'map-vendor'
          }

          if (id.includes('chart.js') || id.includes('react-chartjs-2')) {
            return 'chart-vendor'
          }

          return undefined
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/image': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
