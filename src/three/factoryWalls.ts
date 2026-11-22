import { create } from 'zustand'

/**
 * Visibilidade das paredes da nave fabril (preferência de vista, não do projeto).
 * - `show`: todas as paredes.
 * - `auto`: esconde as paredes que ficam entre a câmara e o interior (vista em corte).
 * - `hide`: só o pavimento; paredes, pilares, viga e calha técnica desaparecem.
 * Os componentes do projeto (quadro, bombas, reservatórios…) nunca são ocultados.
 */
export type FactoryWallsMode = 'show' | 'auto' | 'hide'
export type FactoryWallSide = 'back' | 'left' | 'right'

export const FACTORY_WALLS_MODES: readonly FactoryWallsMode[] = ['show', 'auto', 'hide']
const STORAGE_KEY = 'dc-simu:factory-walls'

const isMode = (value: unknown): value is FactoryWallsMode => FACTORY_WALLS_MODES.includes(value as FactoryWallsMode)

function readStored(): FactoryWallsMode {
  try {
    const value = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    return isMode(value) ? value : 'show'
  } catch { return 'show' }
}

export const useFactoryWalls = create<{ mode: FactoryWallsMode; setMode: (mode: FactoryWallsMode) => void; cycle: () => void }>((set, get) => ({
  mode: readStored(),
  setMode: (mode) => {
    if (!isMode(mode)) return
    try { localStorage.setItem(STORAGE_KEY, mode) } catch { /* vista privada: fica só nesta sessão */ }
    set({ mode })
  },
  cycle: () => {
    const i = FACTORY_WALLS_MODES.indexOf(get().mode)
    get().setMode(FACTORY_WALLS_MODES[(i + 1) % FACTORY_WALLS_MODES.length])
  },
}))

/**
 * Que paredes ficam visíveis. Em `auto` uma parede esconde-se quando a câmara está do
 * lado de fora do seu plano (a parede taparia o interior).
 */
export function factoryWallVisibility(
  mode: FactoryWallsMode,
  camera: { x: number; z: number },
  walls: { backZ: number; leftX: number; rightX: number },
): Record<FactoryWallSide, boolean> {
  if (mode === 'show') return { back: true, left: true, right: true }
  if (mode === 'hide') return { back: false, left: false, right: false }
  return { back: camera.z >= walls.backZ, left: camera.x >= walls.leftX, right: camera.x <= walls.rightX }
}
