// Migração única das versões antigas que ainda exigiam confirmação manual.
// O marcador vive num cache próprio e persistente: no primeiro install deste
// protocolo o worker ativa imediatamente. Nos builds seguintes, a aplicação
// já tem o gestor global que guarda trabalho pendente antes de enviar
// SKIP_WAITING ao novo worker.
const DC_SIMU_UPDATE_PROTOCOL_CACHE = 'dcsimu-update-protocol-v1'
const DC_SIMU_UPDATE_PROTOCOL_MARKER = '/.dcsimu-update-protocol-v1'

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(DC_SIMU_UPDATE_PROTOCOL_CACHE)
    const migrated = await cache.match(DC_SIMU_UPDATE_PROTOCOL_MARKER)
    if (migrated) return
    await cache.put(DC_SIMU_UPDATE_PROTOCOL_MARKER, new Response('ready', {
      headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
    }))
    await self.skipWaiting()
  })())
})
