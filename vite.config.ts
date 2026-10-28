import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

function gitCommit() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA
  if (process.env.APP_BUILD_COMMIT) return process.env.APP_BUILD_COMMIT
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return `local-${Date.now()}`
  }
}

/** Carimbo incrementado pelo hook pre-commit: cada commit gera um buildId novo (e a limpeza de caches nos clientes). */
function releaseStamp() {
  try {
    const stamp = JSON.parse(readFileSync(new URL('./release-stamp.json', import.meta.url), 'utf8')) as { count?: number; epoch?: string }
    return `r${stamp.count ?? 0}.${stamp.epoch ?? '0'}`
  } catch { return 'r0' }
}

const buildId = `${gitCommit()}.${releaseStamp()}`
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
    // A publicação Vercel é estática e não disponibiliza as rotas /api.
    __APP_STATIC_DEPLOY__: JSON.stringify(process.env.VERCEL === '1'),
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
        // Precache só da aplicação (shell). Modelos GLB, PDFs e texturas pesam ~38 MB: ficam fora do
        // precache (a primeira visita deixa de descarregar tudo) e entram em cache ao primeiro uso.
        globPatterns: ['**/*.{js,css,html,svg,png,webp}'],
        globIgnores: ['models/**', 'datasheets/**', 'textures/**', '**/*.glb', '**/*.pdf'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/models/') || url.pathname.endsWith('.glb'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'dcsimu-models-v1',
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/textures/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'dcsimu-textures-v1',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/datasheets/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'dcsimu-datasheets-v1',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Helpers partilhados (interop CommonJS / Babel) ficam no chunk base para não arrastarem o r3f.
          if (id.includes('commonjsHelpers') || id.includes('@babel/runtime') || id.includes('vite/preload-helper') || id.includes('modulepreload-polyfill')) return 'vendor-react'
          if (id.includes('/zustand/') || id.includes('use-sync-external-store')) return 'vendor-react'
          if (!id.includes('node_modules')) return undefined
          // O arranque só precisa do núcleo do three (matemática na store/catálogo); fiber/drei/stdlib ficam
          // num chunk à parte, carregado apenas quando uma vista 3D é aberta.
          if (id.includes('@react-three') || id.includes('three-stdlib') || id.includes('three-mesh-bvh') || id.includes('/maath/') || id.includes('/camera-controls/') || id.includes('/meshline/')) return 'vendor-r3f'
          if (id.includes('/node_modules/three/')) return 'vendor-three'
          if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/') || id.includes('react-router')) return 'vendor-react'
          if (id.includes('@supabase')) return 'vendor-supabase'
          return undefined
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
})
