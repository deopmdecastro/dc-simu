import { useEffect, useRef } from 'react'
import { registerSW } from 'virtual:pwa-register'

type VersionFile = { buildId?: string; builtAt?: string }
type BeforeUpdate = () => boolean | Promise<boolean>

const BUILD_KEY = 'dcsimu:app:build:v1'
const CHECK_INTERVAL_MS = 60_000
const SNOOZE_MS = 10 * 60_000

/**
 * Ecrãs com trabalho próprio (ex.: o editor de componentes) registam aqui um intercetor: é chamado antes de a
 * atualização ser aplicada e decide se avança (true — depois de guardar/perguntar) ou se adia (false).
 */
type Interceptor = () => boolean | Promise<boolean>
let interceptor: Interceptor | null = null
export function setUpdateInterceptor(next: Interceptor | null): () => void {
  interceptor = next
  return () => { if (interceptor === next) interceptor = null }
}

/**
 * Regista o service worker em toda a aplicação e aplica atualizações sem
 * diálogo. A ativação só acontece depois de `beforeUpdate` confirmar que o
 * trabalho pendente ficou persistido.
 */
export function useAppUpdates(beforeUpdate: BeforeUpdate) {
  const beforeUpdateRef = useRef(beforeUpdate)
  beforeUpdateRef.current = beforeUpdate

  useEffect(() => {
    let disposed = false
    let registration: ServiceWorkerRegistration | undefined
    let activating = false
    let fallbackReload = 0
    let snoozeUntil = 0

    try {
      localStorage.setItem(BUILD_KEY, __APP_BUILD_ID__)
    } catch {
      // A atualização do SW não depende do localStorage.
    }

    const activate = async () => {
      if (disposed || activating || Date.now() < snoozeUntil) return
      activating = true
      try {
        if (interceptor && !(await interceptor())) { snoozeUntil = Date.now() + SNOOZE_MS; return }
        const safeToReload = await beforeUpdateRef.current()
        if (!safeToReload || disposed) return
        await updateSW(true)
        // O workbox-window recarrega em `controlling`. Este temporizador cobre
        // navegadores que ativam o worker mas não emitem esse evento a tempo.
        fallbackReload = window.setTimeout(() => window.location.reload(), 4_000)
      } catch (error) {
        console.error('Não foi possível aplicar a atualização do DC-SIMU.', error)
      } finally {
        activating = false
      }
    }

    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh: () => { void activate() },
      onRegisteredSW: (_url, currentRegistration) => { registration = currentRegistration },
      onRegisterError: (error) => console.error('Falha ao registar o service worker do DC-SIMU.', error),
    })

    const checkVersion = async () => {
      if (disposed || activating || document.visibilityState === 'hidden') return
      try {
        const response = await fetch(`/version.json?t=${Date.now()}`, {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        })
        if (!response.ok) return
        const remote = await response.json() as VersionFile
        if (!remote.buildId || remote.buildId === __APP_BUILD_ID__) return
        await registration?.update()
        if (registration?.waiting) await activate()
      } catch {
        // Sem rede: a versão atual e o funcionamento offline são preservados.
      }
    }

    const onVisible = () => { if (document.visibilityState === 'visible') void checkVersion() }
    const interval = window.setInterval(() => { void checkVersion() }, CHECK_INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', checkVersion)
    void checkVersion()

    return () => {
      disposed = true
      window.clearInterval(interval)
      window.clearTimeout(fallbackReload)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', checkVersion)
    }
  }, [])
}
