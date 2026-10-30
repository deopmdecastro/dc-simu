import { create } from 'zustand'
import { isHexColor } from './lightLook'

/**
 * Biblioteca de cores de luzes: cada cor é um par **vidro** (a lente/difusor, visto apagado) +
 * **brilho** (a luz emitida, o halo e a luz projetada). Cores de fábrica + cores criadas pelo Admin
 * (guardadas neste navegador). As zonas luminosas copiam o par — a simulação não depende da biblioteca.
 */
export interface LightSwatch { id: string; name: string; glass: string; glow: string; builtin?: boolean }

/** Pares típicos de sinaleiros/LEDs: a lente é mais escura e saturada que a luz que emite. */
export const BUILTIN_LIGHT_SWATCHES: LightSwatch[] = [
  { id: 'red', name: 'Vermelho', glass: '#c72424', glow: '#ff2a1a', builtin: true },
  { id: 'amber', name: 'Âmbar', glass: '#d98a0b', glow: '#ffb02e', builtin: true },
  { id: 'yellow', name: 'Amarelo', glass: '#d6b400', glow: '#ffe14a', builtin: true },
  { id: 'green', name: 'Verde', glass: '#1c9a46', glow: '#2bff6a', builtin: true },
  { id: 'blue', name: 'Azul', glass: '#1d4ed8', glow: '#4d8dff', builtin: true },
  { id: 'cyan', name: 'Ciano', glass: '#0e8fa8', glow: '#38e1ff', builtin: true },
  { id: 'white', name: 'Branco', glass: '#dfe4ea', glow: '#ffffff', builtin: true },
  { id: 'clear', name: 'Incolor (lâmpada)', glass: '#f1f5f9', glow: '#ffe7b0', builtin: true },
  { id: 'violet', name: 'Violeta', glass: '#7c3aed', glow: '#b67cff', builtin: true },
]

const KEY = 'dcsimu:light-colors:v1'

function load(): LightSwatch[] {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '[]') as unknown
    if (!Array.isArray(raw)) return []
    return raw.filter((item): item is LightSwatch => !!item && typeof item === 'object' && typeof (item as LightSwatch).id === 'string'
      && isHexColor((item as LightSwatch).glass) && isHexColor((item as LightSwatch).glow))
      .map((item) => ({ id: item.id, name: String(item.name || 'Cor'), glass: item.glass.toLowerCase(), glow: item.glow.toLowerCase() }))
  } catch { return [] }
}

function save(list: LightSwatch[]) {
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(list)) } catch { /* modo privado / quota */ }
}

interface LibraryState {
  custom: LightSwatch[]
  /** Cria (ou atualiza, se já existir uma cor com o mesmo par) uma cor da biblioteca. */
  add: (swatch: { name: string; glass: string; glow: string }) => LightSwatch | null
  remove: (id: string) => void
}

export const useLightColorLibrary = create<LibraryState>((set, get) => ({
  custom: load(),
  add: ({ name, glass, glow }) => {
    if (!isHexColor(glass) || !isHexColor(glow)) return null
    const pair = { glass: glass.toLowerCase(), glow: glow.toLowerCase() }
    const existing = [...BUILTIN_LIGHT_SWATCHES, ...get().custom].find((item) => item.glass === pair.glass && item.glow === pair.glow)
    if (existing) return existing
    const created: LightSwatch = { id: `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name: name.trim() || 'Cor personalizada', ...pair }
    const custom = [...get().custom, created]
    save(custom)
    set({ custom })
    return created
  },
  remove: (id) => {
    const custom = get().custom.filter((item) => item.id !== id)
    save(custom)
    set({ custom })
  },
}))

export const allLightSwatches = (custom: LightSwatch[]) => [...BUILTIN_LIGHT_SWATCHES, ...custom]

/** Nome da cor da biblioteca com este brilho (para legendas no inspetor do simulador). */
export function swatchName(glow: string, glass?: string, custom: LightSwatch[] = []): string | undefined {
  const g = glow.toLowerCase()
  const list = allLightSwatches(custom)
  return (list.find((item) => item.glow === g && (!glass || item.glass === glass.toLowerCase())) ?? list.find((item) => item.glow === g))?.name
}

/** Fundo CSS que mostra o par: anel = vidro, centro = brilho. */
export const swatchBackground = (glass: string | undefined, glow: string) =>
  glass ? `radial-gradient(circle at 50% 50%, ${glow} 0 38%, ${glass} 42% 100%)` : glow
