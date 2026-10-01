/**
 * Limpeza de caches do navegador (Cache Storage + service workers).
 * NUNCA toca em localStorage, sessionStorage nem IndexedDB: projetos, sessão e catálogo ficam intactos.
 */

const KEEP_ON_SOFT_PURGE = [/^workbox-precache/, /^dcsimu-update-protocol/]

async function cacheKeys(): Promise<string[]> {
  try { return 'caches' in window ? await caches.keys() : [] } catch { return [] }
}

/** Remove os caches de execução antigos mas mantém o pré-cache do service worker atual (offline). */
export async function purgeStaleCaches(): Promise<number> {
  const keys = (await cacheKeys()).filter((key) => !KEEP_ON_SOFT_PURGE.some((pattern) => pattern.test(key)))
  await Promise.all(keys.map((key) => caches.delete(key).catch(() => false)))
  return keys.length
}

/** Apaga todos os caches e desregista os service workers. */
export async function purgeAllCaches(): Promise<void> {
  await Promise.all((await cacheKeys()).map((key) => caches.delete(key).catch(() => false)))
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister().catch(() => false)))
    }
  } catch { /* sem service workers */ }
}

/** Limpa tudo, revalida a página na rede (cache HTTP) e recarrega. */
export async function hardRefresh(): Promise<void> {
  await purgeAllCaches()
  try { await fetch(window.location.href, { cache: 'reload', credentials: 'same-origin' }) } catch { /* offline */ }
  window.location.reload()
}

/** Abrir a aplicação com `?limpar-cache` força a limpeza total (útil em navegadores presos numa versão antiga). */
export function consumePurgeRequest(): boolean {
  try {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('limpar-cache')) return false
    url.searchParams.delete('limpar-cache')
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
    return true
  } catch { return false }
}
