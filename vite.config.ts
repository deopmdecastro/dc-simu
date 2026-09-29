import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execFileSync } from 'node:child_process'

function gitCommit() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return `local-${Date.now()}`
  }
}

const buildId = gitCommit()
const builtAt = new Date().toISOString()

function buildVersionFile(): Plugin {
  return {
    name: 'dcsimu-build-version',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ buildId, builtAt }),
      })
    },
  }
}

export default defineConfig({
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
    __APP_BUILT_AT__: JSON.stringify(builtAt),
  },
  plugins: [
    react(),
    buildVersionFile(),
    VitePWA({
      // A aplicação aceita a atualização automaticamente, mas apenas depois de
      // persistir o trabalho sujo (src/utils/appUpdates.ts).
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
        theme_color: '#2655e5',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        importScripts: ['/sw-migration.js'],
        globPatterns: ['**/*.{js,css,html,svg,png,webp,glb,pdf}'],
        // O modelo Allen-Bradley MSR127TP é maior que 5 MiB; mantê-lo em cache evita falha no build PWA.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        navigateFallback: 'index.html',
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
})
