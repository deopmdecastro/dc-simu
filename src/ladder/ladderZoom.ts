import { create } from 'zustand'

/** Escala do diagrama Ladder: partilhada entre o editor e a barra de ferramentas (única fonte de verdade). */
export const LADDER_ZOOM_MIN = 0.7
export const LADDER_ZOOM_MAX = 1.5
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
