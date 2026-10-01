import { create } from 'zustand'
import type { Object3D } from 'three'
import { BASE_STATE } from '../../catalog/stateAnimator'
import { defaultPart, newId, normalizeDefinition, type GlbCache } from '../../catalog/definition'
import type { CatalogEntry, CatalogMeta, ComponentDefinition, MaterialDef, PartDef, StateOverride, TerminalDef, Vec3 } from '../../catalog/types'

export { BASE_STATE }
export type Selection = { kind: 'part' | 'terminal' | 'light'; id: string } | null
export type Tool = 'translate' | 'rotate' | 'scale'
export type InspectorTab = 'object' | 'materials' | 'terminals' | 'lights' | 'states' | 'interactions' | 'component'
export type ViewCommand = { kind: 'fit' | 'front' | 'back' | 'left' | 'right' | 'top' | 'iso'; n: number }

/** Cache dos GLB importados (módulo): evita reler/parsear a cada alteração. */
export const glbCache: GlbCache = new Map<string, Object3D>()

interface Snapshot { meta: CatalogMeta; def: ComponentDefinition }
const HISTORY_LIMIT = 80

interface EditorStore {
  entry: CatalogEntry | null
  meta: CatalogMeta
  def: ComponentDefinition
  /** Última versão publicada (para listar as alterações antes de publicar). */
  baseline: ComponentDefinition | null
  selection: Selection
  tool: Tool
  snap: { on: boolean; mm: number; deg: number }
  mode: 'edit' | 'simulate'
  /** Estado em edição: BASE_STATE (pose base) ou o id de um estado (as alterações guardam-se como diferença). */
  editState: string
  previewState: string
  placing: boolean
  tab: InspectorTab
  materialId: string | null
  view: { grid: boolean; axes: boolean; terminals: boolean; dark: boolean; bounds: boolean }
  viewCommand: ViewCommand
  glbRevision: number
  dirty: boolean
  past: Snapshot[]
  future: Snapshot[]
  lastKey: string
  lastAt: number

  open: (entry: CatalogEntry) => void
  markSaved: (entry: CatalogEntry) => void
  edit: (recipe: (def: ComponentDefinition) => ComponentDefinition, key?: string) => void
  editMeta: (patch: Partial<CatalogMeta>, key?: string) => void
  select: (selection: Selection) => void
  set: (patch: Partial<EditorStore>) => void
  setView: (patch: Partial<EditorStore['view']>) => void
  cameraTo: (kind: ViewCommand['kind']) => void
  undo: () => void
  redo: () => void
  bumpGlb: () => void
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  entry: null,
  meta: { name: '', description: '', category: 'command', group: '', manufacturer: '', reference: '', internalCode: '', tag: 'X', tags: [], properties: [] },
  def: normalizeDefinition(undefined),
  baseline: null,
  selection: null, tool: 'translate', snap: { on: true, mm: 1, deg: 15 }, mode: 'edit',
  editState: BASE_STATE, previewState: 'off', placing: false, tab: 'object', materialId: null,
  view: { grid: true, axes: true, terminals: true, dark: false, bounds: false },
  viewCommand: { kind: 'iso', n: 0 }, glbRevision: 0,
  dirty: false, past: [], future: [], lastKey: '', lastAt: 0,

  open(entry) {
    const draft = normalizeDefinition(entry.draft ?? entry.versions[entry.versions.length - 1]?.definition)
    const last = entry.versions[entry.versions.length - 1]
    set({
      entry, meta: entry.meta, def: draft, baseline: last ? last.definition : null, selection: null, mode: 'edit',
      editState: BASE_STATE, previewState: draft.initialState, placing: false, tab: 'object', dirty: false, past: [], future: [],
      lastKey: '', lastAt: 0, viewCommand: { kind: 'fit', n: Date.now() },
    })
  },
  markSaved(entry) {
    const last = entry.versions[entry.versions.length - 1]
    set({ entry, baseline: last ? last.definition : null, dirty: false })
  },
  edit(recipe, key = '') {
    const { def, meta, past, lastKey, lastAt } = get()
    const next = recipe(def)
    if (next === def) return
    const now = Date.now()
    const coalesce = key !== '' && key === lastKey && now - lastAt < 900
    set({
      def: next, dirty: true, future: [], lastKey: key, lastAt: now,
      past: coalesce ? past : [...past.slice(-(HISTORY_LIMIT - 1)), { meta, def }],
    })
  },
  editMeta(patch, key = 'meta') {
    const { def, meta, past, lastKey, lastAt } = get()
    const now = Date.now()
    const coalesce = key === lastKey && now - lastAt < 900
    set({ meta: { ...meta, ...patch }, dirty: true, future: [], lastKey: key, lastAt: now, past: coalesce ? past : [...past.slice(-(HISTORY_LIMIT - 1)), { meta, def }] })
  },
  select: (selection) => set({ selection, placing: false }),
  set: (patch) => set(patch as never),
  setView: (patch) => set((state) => ({ view: { ...state.view, ...patch } })),
  cameraTo: (kind) => set({ viewCommand: { kind, n: Date.now() } }),
  undo() {
    const { past, def, meta, future } = get()
    const previous = past[past.length - 1]
    if (!previous) return
    set({ def: previous.def, meta: previous.meta, past: past.slice(0, -1), future: [{ def, meta }, ...future], dirty: true, lastKey: '' })
  },
  redo() {
    const { future, def, meta, past } = get()
    const next = future[0]
    if (!next) return
    set({ def: next.def, meta: next.meta, future: future.slice(1), past: [...past, { def, meta }], dirty: true, lastKey: '' })
  },
  bumpGlb: () => set((state) => ({ glbRevision: state.glbRevision + 1 })),
}))

/* --------------------------------------------------------------- operações puras */

export const patchPart = (def: ComponentDefinition, id: string, patch: Partial<PartDef>): ComponentDefinition =>
  ({ ...def, parts: def.parts.map((part) => (part.id === id ? { ...part, ...patch } : part)) })

export const patchMaterial = (def: ComponentDefinition, id: string, patch: Partial<MaterialDef>): ComponentDefinition =>
  ({ ...def, materials: def.materials.map((item) => (item.id === id ? { ...item, ...patch } : item)) })

export const patchTerminal = (def: ComponentDefinition, id: string, patch: Partial<TerminalDef>): ComponentDefinition =>
  ({ ...def, terminals: def.terminals.map((item) => (item.id === id ? { ...item, ...patch } : item)) })

/** Escreve uma pose: na base, ou como diferença dentro de um estado. */
export function posePart(def: ComponentDefinition, editState: string, partId: string, pose: Partial<{ position: Vec3; rotation: Vec3; scale: Vec3; visible: boolean; materialId: string }>): ComponentDefinition {
  if (editState === BASE_STATE) return patchPart(def, partId, pose as Partial<PartDef>)
  return {
    ...def,
    states: def.states.map((state) => {
      if (state.id !== editState) return state
      const override: StateOverride = { ...state.parts[partId], ...pose }
      return { ...state, parts: { ...state.parts, [partId]: override } }
    }),
  }
}

export function descendantsOf(def: ComponentDefinition, id: string): string[] {
  const out: string[] = []
  const walk = (parent: string) => def.parts.filter((part) => part.parentId === parent).forEach((part) => { out.push(part.id); walk(part.id) })
  walk(id)
  return out
}

/** Remove peças e tudo o que as referencia (luzes, interações, diferenças de estado). */
export function removeParts(def: ComponentDefinition, ids: string[]): ComponentDefinition {
  const drop = new Set(ids.flatMap((id) => [id, ...descendantsOf(def, id)]))
  return {
    ...def,
    parts: def.parts.filter((part) => !drop.has(part.id)),
    lights: def.lights.filter((light) => !drop.has(light.partId)),
    interactions: def.interactions.map((item) => (drop.has(item.partId) ? { ...item, partId: '' } : item)),
    states: def.states.map((state) => ({ ...state, parts: Object.fromEntries(Object.entries(state.parts).filter(([id]) => !drop.has(id))) })),
  }
}

export function addPart(def: ComponentDefinition, kind: PartDef['kind'], parentId: string | null = null): { def: ComponentDefinition; part: PartDef } {
  const material = def.materials[0]
  const part = { ...defaultPart(kind, kind === 'group' || kind === 'glb' ? null : material?.id ?? null), parentId }
  return { def: { ...def, parts: [...def.parts, part] }, part }
}

export function duplicatePart(def: ComponentDefinition, id: string): { def: ComponentDefinition; id: string } | null {
  const source = def.parts.find((part) => part.id === id)
  if (!source) return null
  const map = new Map<string, string>()
  const clones: PartDef[] = []
  const clone = (part: PartDef, parentId: string | null) => {
    const copy: PartDef = { ...part, id: newId('p_'), name: parentId === source.parentId && part.id === source.id ? `${part.name} (cópia)` : part.name, parentId, position: [...part.position] as Vec3, rotation: [...part.rotation] as Vec3, scale: [...part.scale] as Vec3, size: [...part.size] as Vec3 }
    if (part.id === source.id) copy.position = [part.position[0] + 10, part.position[1], part.position[2] + 10]
    map.set(part.id, copy.id)
    clones.push(copy)
    def.parts.filter((child) => child.parentId === part.id).forEach((child) => clone(child, copy.id))
  }
  clone(source, source.parentId)
  return { def: { ...def, parts: [...def.parts, ...clones] }, id: map.get(id)! }
}

/** Borne novo, com rótulo livre e normal alinhada ao eixo dominante da face. */
export function newTerminal(def: ComponentDefinition, position: Vec3, normal: Vec3): TerminalDef {
  const used = new Set(def.terminals.map((terminal) => terminal.label))
  let n = def.terminals.length + 1
  while (used.has(String(n))) n += 1
  const [x, y, z] = normal
  const axis = Math.abs(x) >= Math.abs(y) && Math.abs(x) >= Math.abs(z) ? 0 : Math.abs(y) >= Math.abs(z) ? 1 : 2
  const snapped: Vec3 = [0, 0, 0]
  snapped[axis] = normal[axis] >= 0 ? 1 : -1
  return {
    id: newId('t_'), label: String(n), name: `Borne ${n}`, position: position.map((v) => Math.round(v * 10) / 10) as Vec3, normal: snapped,
    kind: 'io', terminalType: 'screw', polarity: 'none', electricalClass: 'other', direction: 'io', accepts: '', color: '#cbd5e1',
  }
}
