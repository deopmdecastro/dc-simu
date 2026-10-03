import { useSyncExternalStore } from 'react'

/**
 * Modo «clean»: esconde barras e painéis secundários para dar o máximo de área
 * ao canvas (Esquema, 3D, editor de componentes, Ladder e GRAFCET).
 * Liga-se sozinho em ecrãs pequenos/tácteis; a escolha do utilizador fica guardada.
 */
const KEY = 'dcsimu:clean-mode:v1'

export const isSmallScreen = () => {
  try {
    return window.innerWidth < 1200 || window.matchMedia('(pointer: coarse) and (max-height: 700px)').matches
  } catch { return false }
}

let value: boolean = (() => {
  try {
    const saved = localStorage.getItem(KEY)
    return saved === null ? isSmallScreen() : saved === '1'
  } catch { return isSmallScreen() }
})()
const listeners = new Set<() => void>()

const apply = () => {
  if (typeof document !== 'undefined') document.documentElement.dataset.clean = value ? 'true' : 'false'
}
apply()

export function setCleanMode(next: boolean) {
  value = next
  try { localStorage.setItem(KEY, next ? '1' : '0') } catch { /* navegação privada */ }
  apply()
  listeners.forEach((fn) => fn())
}

export function useCleanMode(): [boolean, (next: boolean) => void] {
  const clean = useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => { listeners.delete(fn) } },
    () => value,
    () => value,
  )
  return [clean, setCleanMode]
}
