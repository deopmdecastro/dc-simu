import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import { isSmallScreen } from './cleanMode'

/**
 * Estado de interface partilhado pela barra de ferramentas e pelos editores:
 *  - «Simulação» (igual ao do GRAFCET) no Esquema/3D e no Ladder;
 *  - pedido para abrir os «Atalhos» do simulador ativo.
 */
export type SimPanelView = 'schematic' | 'ladder'
export type ShortcutView = 'schematic' | 'ladder' | 'grafcet' | 'monitor'

const KEYS: Record<SimPanelView, string> = { schematic: 'dcsimu:schematic:sim-open', ladder: 'dcsimu:ladder:status-open' }
const fallback = (view: SimPanelView) => view === 'ladder' && !isSmallScreen()
const read = (view: SimPanelView) => {
  try { const value = localStorage.getItem(KEYS[view]); return value === null ? fallback(view) : value !== '0' } catch { return fallback(view) }
}
const write = (view: SimPanelView, on: boolean) => { try { localStorage.setItem(KEYS[view], on ? '1' : '0') } catch { /* navegação privada */ } }

interface SimUiState {
  schematic: boolean
  ladder: boolean
  setSimPanel: (view: SimPanelView, on: boolean) => void
  toggleSimPanel: (view: SimPanelView) => void
}

export const useSimUi = create<SimUiState>((set, get) => ({
  schematic: read('schematic'),
  ladder: read('ladder'),
  setSimPanel: (view, on) => { if (get()[view] === on) return; write(view, on); set({ [view]: on } as Pick<SimUiState, SimPanelView>) },
  toggleSimPanel: (view) => get().setSimPanel(view, !get()[view]),
}))

const SHORTCUTS_EVENT = 'dcsimu:shortcuts'

/** Botão «Atalhos» da barra: pede ao editor montado que abra a sua ajuda. */
export function requestShortcuts(view: ShortcutView) {
  window.dispatchEvent(new CustomEvent<ShortcutView>(SHORTCUTS_EVENT, { detail: view }))
}

/** O editor regista-se para abrir a ajuda de teclado quando a barra o pede. */
export function useShortcutsRequest(view: ShortcutView, open: () => void) {
  const ref = useRef(open)
  ref.current = open
  useEffect(() => {
    const onRequest = (event: Event) => { if ((event as CustomEvent<ShortcutView>).detail === view) ref.current() }
    window.addEventListener(SHORTCUTS_EVENT, onRequest)
    return () => window.removeEventListener(SHORTCUTS_EVENT, onRequest)
  }, [view])
}
