import { create } from 'zustand'

/** Escala do diagrama Ladder: partilhada entre o editor e a barra de ferramentas (única fonte de verdade). */
/* 0,4× permite ver uma network inteira (720 px) num telefone de 390 px; a
   pinça volta a aproximar sem perder o ponto de referência. */
export const LADDER_ZOOM_MIN = 0.4
export const LADDER_ZOOM_MAX = 3
export const LADDER_ZOOM_STEP = 0.1
const KEY = 'dcsimu:ladder:zoom:v2'

const clamp = (z: number) => Math.max(LADDER_ZOOM_MIN, Math.min(LADDER_ZOOM_MAX, Number(z.toFixed(2))))
const read = () => { try { return clamp(Number(localStorage.getItem(KEY)) || 1) } catch { return 1 } }

interface LadderZoomState {
  zoom: number
  setZoom: (next: number | ((current: number) => number)) => void
}

export const useLadderZoom = create<LadderZoomState>((set, get) => ({
  zoom: read(),
  setZoom: (next) => {
    const zoom = clamp(typeof next === 'function' ? next(get().zoom) : next)
    try { localStorage.setItem(KEY, String(zoom)) } catch { /* navegação privada */ }
    set({ zoom })
  },
}))

/**
 * Escala que faz caber a network mais larga na área visível.
 * `natural` é a largura do diagrama a 100 % (sem escala) e `available` a largura
 * disponível do canvas. Devolve sempre um valor dentro dos limites do editor.
 */
export function fitLadderZoom(natural: number, available: number): number {
  if (!Number.isFinite(natural) || !Number.isFinite(available) || natural <= 0 || available <= 0) return 1
  const margin = 24 // respiro para as barras e o cartão não colarem às bordas
  return clamp(Math.min(1, (available - margin) / natural))
}
