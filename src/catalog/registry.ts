import { create } from 'zustand'
import { SCHEMATIC_PX_PER_MM, registerCatalogModel, setCatalogModelPath } from '../three/modelPaths'
import { TEMPLATES, type ComponentTemplate } from '../electrical/factory'
import type { ComponentType } from '../types'
import { catalogApi } from './catalogApi'
import { hiddenCatalogTypes } from './hidden'
import { catalogType, isCatalogType, parseCatalogType, type CatalogEntry, type CatalogVersion } from './types'

const PALETTE_GROUP = 'Catálogo oficial'
const registered = new Set<string>()
/** Tipos antigos que já não devem aparecer na biblioteca (há versão mais recente ou o componente foi arquivado). */
const hiddenInLibrary = hiddenCatalogTypes

function templateOf(entry: CatalogEntry, version: CatalogVersion): ComponentTemplate {
  const runtime = version.runtime
  const isMultimeter = version.definition.behavior?.type === 'multimeter'
  return {
    category: isMultimeter ? 'measurement' : entry.meta.category,
    paletteName: entry.meta.name,
    // Multímetros publicados (incluindo o DM-20 com LCD e botões) aparecem
    // sempre numa pasta própria, mesmo que tenham sido criados antes desta categoria.
    group: isMultimeter ? 'Aparelhos de medir' : entry.meta.group?.trim() ? `${PALETTE_GROUP} · ${entry.meta.group.trim()}` : PALETTE_GROUP,
    tag: (entry.meta.tag || 'X').replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || 'X',
    w: Math.max(1, Math.round(runtime.widthMm * SCHEMATIC_PX_PER_MM)),
    h: Math.max(1, Math.round(runtime.heightMm * SCHEMATIC_PX_PER_MM)),
    terminals: runtime.terminals.map((terminal) => ({
      label: terminal.label, kind: terminal.kind, x: terminal.x, y: terminal.y, terminalType: terminal.terminalType, color: terminal.color,
      diameter: terminal.diameterMm ? terminal.diameterMm * SCHEMATIC_PX_PER_MM : undefined,
      defId: terminal.id, electricalClass: terminal.electricalClass, position3D: terminal.position3D, displayName: terminal.name && terminal.name !== terminal.label ? terminal.name : undefined,
      rules: { polarity: terminal.polarity, direction: terminal.direction, accepts: terminal.accepts },
    })),
    defaultState: { catalogState: version.definition.initialState },
  }
}

export function registerCatalogVersion(entry: CatalogEntry, version: CatalogVersion): ComponentType {
  const type = catalogType(entry.id, version.version) as ComponentType
  const runtime = version.runtime
  const placement = version.definition.mount
  ;(TEMPLATES as Record<string, ComponentTemplate>)[type] = templateOf(entry, version)
  registerCatalogModel(type, `/api/catalog/${entry.id}/glb/${version.version}`, { width: runtime.widthMm, height: runtime.heightMm, depth: runtime.depthMm }, placement)
  registered.add(type)
  return type
}

interface CatalogState {
  entries: CatalogEntry[]
  loaded: boolean
  /** Incrementa a cada atualização para a biblioteca/inspetor refazerem as listas. */
  revision: number
  load: () => Promise<void>
  ensureLoaded: () => Promise<void>
  loadNow: () => Promise<void>
}

let pending: Promise<void> | null = null

export const useCatalogStore = create<CatalogState>((set, get) => ({
  entries: [], loaded: false, revision: 0,
  ensureLoaded() {
    if (get().loaded) return Promise.resolve()
    return pending ?? get().load()
  },
  load() {
    pending = get().loadNow()
    return pending.finally(() => { pending = null })
  },
  async loadNow() {
    try {
      const entries = await catalogApi.list()
      hiddenInLibrary.clear()
      for (const entry of entries) {
        for (const version of entry.versions) {
          const type = registerCatalogVersion(entry, version)
          const isLatest = version.version === entry.latestVersion && !entry.archived
          if (!isLatest) hiddenInLibrary.add(type)
          try { setCatalogModelPath(type, await catalogApi.glbUrl(entry.id, version.version)) } catch { /* GLB em falta: o componente fica sem modelo */ }
        }
      }
      set((state) => ({ entries, loaded: true, revision: state.revision + 1 }))
    } catch {
      set((state) => ({ loaded: true, revision: state.revision + 1 }))
    }
  },
}))

export const latestVersionOf = (entries: CatalogEntry[], id: string) => {
  const entry = entries.find((item) => item.id === id)
  return entry && !entry.archived ? entry.versions.find((version) => version.version === entry.latestVersion) : undefined
}

export { isCatalogType, parseCatalogType }
