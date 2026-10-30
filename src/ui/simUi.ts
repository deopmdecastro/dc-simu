import { PHONE_TOUCH_QUERY } from './device'
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

const HINTS_KEY = 'dcsimu:showHints'
/** Dicas do canvas: ligadas no computador, desligadas no telemóvel (são um cartão sobre o desenho). */
const readHints = () => {
  try {
    const saved = localStorage.getItem(HINTS_KEY)
    if (saved !== null) return saved === '1'
    return !window.matchMedia(`(max-width: 700px), ${PHONE_TOUCH_QUERY}`).matches
  } catch { return true }
}

interface SimUiState {
  schematic: boolean
  ladder: boolean
  setSimPanel: (view: SimPanelView, on: boolean) => void
  toggleSimPanel: (view: SimPanelView) => void
  /** Dicas de utilização (alternadas pela barra de ferramentas). */
  hints: boolean
  setHints: (on: boolean) => void
  toggleHints: () => void
  /** Dica da ferramenta ou do estado atual do canvas, escrita pelo editor montado. */
  canvasHint: string
  setCanvasHint: (text: string) => void
  /** Colocação de texto no editor ativo, espelhada na barra. */
  textPlacement: boolean
}

export const useSimUi = create<SimUiState>((set, get) => ({
  schematic: read('schematic'),
  ladder: read('ladder'),
  setSimPanel: (view, on) => { if (get()[view] === on) return; write(view, on); set({ [view]: on } as Pick<SimUiState, SimPanelView>) },
  toggleSimPanel: (view) => get().setSimPanel(view, !get()[view]),
  hints: readHints(),
  setHints: (on) => {
    if (get().hints === on) return
    try { localStorage.setItem(HINTS_KEY, on ? '1' : '0') } catch { /* navegação privada */ }
    set({ hints: on })
  },
  toggleHints: () => get().setHints(!get().hints),
  canvasHint: '',
  textPlacement: false,
  setCanvasHint: (text) => { if (get().canvasHint !== text) set({ canvasHint: text }) },
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

/* ---------------------------------------------------------------------------
   Ações de vista pedidas pela barra de ferramentas
   ---------------------------------------------------------------------------
   Enquadrar a vista e a seleção viviam em botões flutuantes sobre o canvas.
   Passaram para a barra: a barra pede, o editor montado executa.
*/
export type CanvasAction = 'fit' | 'focusSelection' | 'addNote' | 'addText'

const CANVAS_EVENT = 'dcsimu:canvas-action'

/** Pede ao canvas ativo (Esquema 2D/3D) que enquadre a vista ou a seleção. */
export function requestCanvasAction(action: CanvasAction) {
  window.dispatchEvent(new CustomEvent<CanvasAction>(CANVAS_EVENT, { detail: action }))
}

/** O canvas regista-se para cumprir os pedidos de enquadramento da barra. */
export function useCanvasAction(handler: (action: CanvasAction) => void) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    const onRequest = (event: Event) => ref.current((event as CustomEvent<CanvasAction>).detail)
    window.addEventListener(CANVAS_EVENT, onRequest)
    return () => window.removeEventListener(CANVAS_EVENT, onRequest)
  }, [])
}
