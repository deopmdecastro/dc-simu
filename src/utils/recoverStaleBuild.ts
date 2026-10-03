/**
 * Recuperação de versões «presas» em cache (PWA).
 *
 * Sintoma: depois de um deploy novo, o service worker continua a servir um
 * `index.html` antigo que aponta para ficheiros JS que já não existem no
 * servidor. Qualquer `import()` tardio (editor 3D, motor 3D, GRAFCET…) falha e
 * o ecrã fica em branco — tipicamente só num dispositivo (iPhone/Safari) que
 * nunca aceitou a atualização.
 *
 * Aqui apanha-se esse erro e faz-se, uma única vez por sessão, a limpeza
 * completa: caches do Workbox + service workers + recarregar sem cache.
 */

const FLAG = 'dcsimu:stale-build-recovered'

const STALE = /(Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError|'text\/html' is not a valid JavaScript MIME type)/i

let running = false

/** Limpa caches e service workers e recarrega a página (uma vez por sessão). */
export async function recoverStaleBuild(reason: string): Promise<void> {
  if (running) return
  try { if (sessionStorage.getItem(FLAG)) return } catch { /* sem sessionStorage: tenta à mesma */ }
  running = true
  try { sessionStorage.setItem(FLAG, reason.slice(0, 120)) } catch { /* ignorar */ }
  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    }
  } catch { /* ignorar */ }
  try {
    const registrations = await navigator.serviceWorker?.getRegistrations?.()
    await Promise.all((registrations ?? []).map((registration) => registration.unregister()))
  } catch { /* ignorar */ }
  // `reload(true)` já não existe: um URL com marca de tempo garante HTML fresco.
  const url = new URL(window.location.href)
  url.searchParams.set('_fresh', String(Date.now()))
  window.location.replace(url.toString())
}

/** Indica se a sessão atual já veio de uma recuperação (para avisar o utilizador). */
export function recoveredFromStaleBuild(): boolean {
  try { return !!sessionStorage.getItem(FLAG) } catch { return false }
}

/** Liga os detetores globais. Chamar uma vez, no arranque. */
export function installStaleBuildRecovery(): void {
  if (typeof window === 'undefined') return
  const check = (message: unknown) => { const text = String(message ?? ''); if (STALE.test(text)) void recoverStaleBuild(text) }
  // Vite avisa quando um chunk pré-carregado falha.
  window.addEventListener('vite:preloadError', (event) => { check((event as unknown as { payload?: { message?: string } }).payload?.message ?? 'Failed to fetch dynamically imported module') })
  window.addEventListener('error', (event) => { check(event.message || (event.error as Error | undefined)?.message) })
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as { message?: string } | string | undefined
    check(typeof reason === 'string' ? reason : reason?.message)
  })
}
