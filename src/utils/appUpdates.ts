import { useEffect, useRef } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { consumePurgeRequest, hardRefresh, purgeStaleCaches } from './cacheCleanup'

type VersionFile = { buildId?: string; builtAt?: string }
type BeforeUpdate = () => boolean | Promise<boolean>

const BUILD_KEY = 'dcsimu:app:build:v1'
const CHECK_INTERVAL_MS = 60_000
const SNOOZE_MS = 10 * 60_000
/** Última versão para a qual já se fez limpeza total nesta sessão (evita ciclos de recarga). */
const PURGE_KEY = 'dcsimu:app:purged:v1'

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

    // Limpeza de caches: pedida no URL (?limpar-cache) ou ao arrancar numa versão nova
    // (apaga caches de execução antigos; o pré-cache do worker atual fica para o modo offline).
    if (consumePurgeRequest()) void hardRefresh()
    try {
      const previous = localStorage.getItem(BUILD_KEY)
      if (previous && previous !== __APP_BUILD_ID__) void purgeStaleCaches()
      localStorage.setItem(BUILD_KEY, __APP_BUILD_ID__)
    } catch {
      // A atualização do SW não depende do localStorage.
    }

    // Espera (até 15 s) que o worker novo termine a instalação.
    const settle = (reg?: ServiceWorkerRegistration) => new Promise<void>((resolve) => {
      const worker = reg?.installing
      if (!worker || worker.state === 'installed' || worker.state === 'activated') { resolve(); return }
      const timer = window.setTimeout(resolve, 15_000)
      worker.addEventListener('statechange', () => { if (worker.state === 'installed' || worker.state === 'activated' || worker.state === 'redundant') { window.clearTimeout(timer); resolve() } })
    })

    const activate = async () => {
      if (disposed || activating || Date.now() < snoozeUntil) return
      activating = true
      try {
        if (interceptor && !(await interceptor())) { snoozeUntil = Date.now() + SNOOZE_MS; return }
        const safeToReload = await beforeUpdateRef.current()
        if (!safeToReload) { snoozeUntil = Date.now() + SNOOZE_MS; return }
        if (disposed) return
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
      if (disposed || activating || Date.now() < snoozeUntil || document.visibilityState === 'hidden') return
      try {
        const response = await fetch(`/version.json?t=${Date.now()}`, {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        })
        if (!response.ok) return
        const remote = await response.json() as VersionFile
        if (!remote.buildId || remote.buildId === __APP_BUILD_ID__) return
        await registration?.update()
        await settle(registration)
        if (registration?.waiting) { await activate(); return }
        // Versão nova no servidor mas nenhum worker novo à espera (worker preso ou em falta):
        // limpeza total das caches e recarga, uma vez por versão.
        if (sessionStorage.getItem(PURGE_KEY) === remote.buildId) return
        if (interceptor && !(await interceptor())) { snoozeUntil = Date.now() + SNOOZE_MS; return }
        if (!(await beforeUpdateRef.current())) { snoozeUntil = Date.now() + SNOOZE_MS; return }
        if (disposed) return
        sessionStorage.setItem(PURGE_KEY, remote.buildId)
        activating = true
        await hardRefresh()
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
