import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  server: { host: '0.0.0.0', proxy: { '/api': 'http://127.0.0.1:3000' } },
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
    manifest: {
      name: 'DC-SIMU — Simulador de Comandos Elétricos',
      short_name: 'DC-SIMU',
      description: 'Esquema elétrico, painel 3D, Ladder e GRAFCET',
      lang: 'pt-PT',
      start_url: './',
      scope: './',
      display: 'standalone',
      background_color: '#f8fafd',
      theme_color: '#2454d7',
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png,webp,glb,pdf}'],
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      navigateFallback: 'index.html',
    },
  })],
})
