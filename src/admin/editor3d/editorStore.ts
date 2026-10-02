import { create } from 'zustand'
import type { Object3D } from 'three'
import { BASE_STATE } from '../../catalog/stateAnimator'
import { defaultPart, newId, normalizeDefinition, type GlbCache } from '../../catalog/definition'
import { EMPTY_METER_INPUT, type MeterInput, type Vars } from '../../catalog/behavior'
import type { Face, TerminalSpec } from '../../catalog/terminalProfiles'
import type { WireEndType } from '../../types'
import type { CatalogEntry, CatalogMeta, ComponentDefinition, MaterialDef, PartDef, StateOverride, TerminalDef, Vec3 } from '../../catalog/types'
import { DEFAULT_WIRE_DEFAULTS, styleFor, type WireDefaults, type WireStyle } from './wireStyle'

export { BASE_STATE }
export type Selection = { kind: 'part' | 'terminal' | 'light' | 'control' | 'display'; id: string } | null
export type Tool = 'translate' | 'rotate' | 'scale'
/** Ferramentas da barra principal (como no simulador): 1 Selecionar · 2 Borne · 3 Cabo · 4 Apagar · 5 Arrastar malha. */
export type Ribbon = 'select' | 'terminal' | 'wire' | 'delete' | 'pan' | 'measure'
export type InspectorTab = 'object' | 'materials' | 'terminals' | 'lights' | 'states' | 'interactions' | 'controls' | 'displays' | 'wires' | 'component'
export type ViewCommand = { kind: 'fit' | 'fitSel' | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'iso' | 'angles' | 'orbit'; n: number; yaw?: number; pitch?: number; dx?: number; dy?: number }
/** Cabo de teste entre dois bornes (modo Simular): serve para validar a compatibilidade. */
export interface TestWire extends WireStyle {
  id: string
  /** Bornes das pontas (null = ponta livre, nesse caso `start`/`end` guardam a posição em mm). */
  a: string | null
  b: string | null
  start?: Vec3
  end?: Vec3
  /** Pontos intermédios do traçado, em mm (como no simulador: o cabo segue as superfícies). */
  points: Vec3[]
  /** Nome curto mostrado nas listas (W1, W2…). */
  number: string
  /** Oculto no viewport (só no editor). */
  hidden?: boolean
}
/** Medição entre dois pontos (régua), em mm. */
export interface Measurement { id: string; a: Vec3; b: Vec3 }
/** Origem do cabo em desenho: um borne ou um ponto livre no espaço. */
export type WireOrigin = { terminalId: string } | { point: Vec3 }
/** Pedido de largada (drag & drop) a partir da biblioteca: o Viewport faz o raycast. */
export interface DropRequest { spec: TerminalSpec; x: number; y: number; n: number }

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
  /** Peças adicionais selecionadas com Ctrl/Shift (seleção múltipla). */
  multi: string[]
  tool: Tool
  ribbon: Ribbon
  snap: { on: boolean; mm: number; deg: number }
  mode: 'edit' | 'simulate'
  /** Estado em edição: BASE_STATE (pose base) ou o id de um estado (as alterações guardam-se como diferença). */
  editState: string
  previewState: string
  placing: boolean
  /** Borne da biblioteca que o próximo clique na superfície vai criar (null = borne em branco). */
  placingSpec: TerminalSpec | null
  /** Face escolhida na barra «Bornes por vista»: fixa a normal dos bornes novos. */
  faceLock: Face | null
  dropRequest: DropRequest | null
  libraryOpen: boolean
  /** Valores das variáveis no ecrã do editor (botões carregados, seletor rodado…). */
  previewVars: Vars
  /** Entradas de teste do multímetro (tensão, resistência…) para validar o LCD no editor. */
  meterTest: MeterInput
  /** Modo «escolher no modelo»: o próximo clique num objeto do GLB liga-o ao controlo/luz. */
  pick: { kind: 'control' | 'light'; id: string } | null
  hoverNode: { partId: string; node: string } | null
  /** Ecrã em colocação: 1.º clique = canto, 2.º clique = canto oposto. */
  placingDisplay: string | null
  displayCorner: { point: Vec3; normal: Vec3 } | null
  /** Modo «colocar LED»: o próximo clique na superfície cria um LED. */
  placingLed: boolean
  camAngles: { yaw: number; pitch: number }
  testWires: TestWire[]
  /** Cabo em desenho: borne de origem (ou ponto livre em `wireStart`) e pontos intermédios. */
  wireFrom: string | null
  wireStart: Vec3 | null
  wirePoints: Vec3[]
  /** Valores dos cabos novos (cor, secção, condutor e terminação). */
  wireDefaults: WireDefaults
  hoverWire: string | null
  selectedWire: string | null
  /** Bornes ocultos no viewport (apenas vista do editor; não altera o componente). */
  hiddenTerminals: string[]
  measurements: Measurement[]
  measureFrom: Vec3 | null
  gizmoSpace: 'local' | 'world'
  tab: InspectorTab
  materialId: string | null
  view: { grid: boolean; floor: boolean; axes: boolean; terminals: boolean; dark: boolean; bounds: boolean }
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
  /** `additive` (Ctrl/Shift) acrescenta ou retira a peça da seleção múltipla. */
  select: (selection: Selection, additive?: boolean) => void
  /** Todas as peças selecionadas (seleção principal + múltipla). */
  selectedParts: () => string[]
  /** Escolhe a ferramenta da barra principal e sincroniza o modo «colocar borne». */
  setRibbon: (ribbon: Ribbon) => void
  set: (patch: Partial<EditorStore>) => void
  setView: (patch: Partial<EditorStore['view']>) => void
  cameraTo: (kind: ViewCommand['kind']) => void
  undo: () => void
  redo: () => void
  bumpGlb: () => void
  startWire: (from: WireOrigin) => void
  addWirePoint: (point: Vec3) => void
  undoWirePoint: () => void
  cancelWire: () => void
  /** Termina o cabo num borne ou num ponto livre; devolve uma mensagem se não for possível. */
  finishWire: (to: WireOrigin) => string | null
  /** Enter / duplo clique: o último ponto passa a ser a ponta livre. */
  finishWireFree: () => string | null
  patchWire: (id: string, patch: Partial<TestWire>) => void
  removeWire: (id: string) => void
  reverseWire: (id: string) => void
  toggleTerminalHidden: (id: string) => void
  setTerminalsHidden: (ids: string[], hidden: boolean) => void
}

const CLEAR_WIRE = { wireFrom: null, wireStart: null, wirePoints: [] as Vec3[] }
const CLEAR_MEASURE = { measureFrom: null as Vec3 | null }
const nextWireNumber = (wires: TestWire[]) => { let n = wires.length + 1; while (wires.some((wire) => wire.number === `W${n}`)) n += 1; return `W${n}` }

export const useEditorStore = create<EditorStore>((set, get) => ({
  entry: null,
  meta: { name: '', description: '', category: 'command', group: '', manufacturer: '', reference: '', internalCode: '', tag: 'X', tags: [], properties: [] },
  def: normalizeDefinition(undefined),
  baseline: null,
  selection: null, multi: [], tool: 'translate', ribbon: 'select', snap: { on: true, mm: 1, deg: 15 }, mode: 'edit',
  editState: BASE_STATE, previewState: 'off', placing: false, placingSpec: null, faceLock: null, dropRequest: null, libraryOpen: false, previewVars: {}, meterTest: { ...EMPTY_METER_INPUT, vdc: 12.34, vac: 230, ohm: 4700 }, pick: null, hoverNode: null, placingDisplay: null, displayCorner: null, placingLed: false, camAngles: { yaw: 35, pitch: 25 }, testWires: [], wireFrom: null, wireStart: null, wirePoints: [], wireDefaults: DEFAULT_WIRE_DEFAULTS, hoverWire: null, selectedWire: null, hiddenTerminals: [], measurements: [], measureFrom: null, gizmoSpace: 'local', tab: 'object', materialId: null,
  view: { grid: true, floor: true, axes: true, terminals: true, dark: false, bounds: false },
  viewCommand: { kind: 'iso', n: 0 }, glbRevision: 0,
  dirty: false, past: [], future: [], lastKey: '', lastAt: 0,

  open(entry) {
    const draft = normalizeDefinition(entry.draft ?? entry.versions[entry.versions.length - 1]?.definition)
    const last = entry.versions[entry.versions.length - 1]
    set({
      entry, meta: entry.meta, def: draft, baseline: last ? last.definition : null, selection: null, multi: [], mode: 'edit',
      editState: BASE_STATE, previewState: draft.initialState, ribbon: 'select', placing: false, placingSpec: null, faceLock: null, testWires: [], ...CLEAR_WIRE, hoverWire: null, selectedWire: null, hiddenTerminals: [], measurements: [], measureFrom: null, tab: 'object', dirty: false, past: [], future: [],
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
  select: (selection, additive = false) => {
    const state = get()
    const base = { placing: false, placingSpec: null, ...(state.ribbon === 'terminal' ? { ribbon: 'select' as Ribbon } : {}) }
    // Ctrl/Shift + clique: junta (ou retira) peças à seleção, como nos editores CAD.
    if (additive && selection?.kind === 'part' && state.selection?.kind === 'part') {
      if (selection.id === state.selection.id) return set({ ...base })
      const already = state.multi.includes(selection.id)
      return set({ ...base, multi: already ? state.multi.filter((id) => id !== selection.id) : [...state.multi, selection.id] })
    }
    set({ ...base, selection, multi: [] })
  },
  selectedParts: () => {
    const { selection, multi } = get()
    return selection?.kind === 'part' ? [selection.id, ...multi.filter((id) => id !== selection.id)] : []
  },
  setRibbon: (ribbon) => set({ ribbon, multi: [], placing: ribbon === 'terminal', placingSpec: ribbon === 'terminal' ? get().placingSpec : null, ...CLEAR_WIRE, ...CLEAR_MEASURE, ...(ribbon === 'terminal' ? { selection: null } : {}) }),
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
  startWire(from) { set('terminalId' in from ? { wireFrom: from.terminalId, wireStart: null, wirePoints: [] } : { wireFrom: null, wireStart: from.point, wirePoints: [] }) },
  addWirePoint: (point) => set((state) => ({ wirePoints: [...state.wirePoints, point] })),
  undoWirePoint() {
    const { wirePoints } = get()
    if (wirePoints.length) set({ wirePoints: wirePoints.slice(0, -1) })
    else set(CLEAR_WIRE)
  },
  cancelWire: () => set(CLEAR_WIRE),
  finishWire(to) {
    const { wireFrom, wireStart, wirePoints, def, testWires } = get()
    const a = wireFrom ? def.terminals.find((item) => item.id === wireFrom) : undefined
    const b = 'terminalId' in to ? def.terminals.find((item) => item.id === to.terminalId) : undefined
    if (!a && !b) return 'Ligue pelo menos uma ponta a um borne.'
    if (a && b && a.id === b.id) return null
    const start = a ? undefined : wireStart ?? undefined
    const end = b ? undefined : ('point' in to ? to.point : undefined)
    const wire: TestWire = {
      id: `w_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, a: a?.id ?? null, b: b?.id ?? null, start, end, points: wirePoints,
      number: nextWireNumber(testWires), ...styleFor(get().wireDefaults, a, b),
    }
    const same = (item: TestWire) => !wirePoints.length && !item.points.length && a && b && ((item.a === a.id && item.b === b.id) || (item.a === b.id && item.b === a.id))
    set({ testWires: [...testWires.filter((item) => !same(item)), wire], selectedWire: wire.id, ...CLEAR_WIRE })
    return null
  },
  finishWireFree() {
    const { wirePoints } = get()
    const last = wirePoints[wirePoints.length - 1]
    if (!last) return null
    return get().finishWire({ point: last })
  },
  patchWire: (id, patch) => set((state) => ({ testWires: state.testWires.map((wire) => (wire.id === id ? { ...wire, ...patch } : wire)) })),
  removeWire: (id) => set((state) => ({ testWires: state.testWires.filter((wire) => wire.id !== id), hoverWire: null, selectedWire: state.selectedWire === id ? null : state.selectedWire })),
  reverseWire(id) {
    set((state) => ({
      testWires: state.testWires.map((wire) => (wire.id !== id ? wire : {
        ...wire, a: wire.b, b: wire.a, start: wire.end, end: wire.start, points: [...wire.points].reverse(), endA: wire.endB, endB: wire.endA,
      })),
    }))
  },
  toggleTerminalHidden(id) {
    const { hiddenTerminals } = get()
    set({ hiddenTerminals: hiddenTerminals.includes(id) ? hiddenTerminals.filter((item) => item !== id) : [...hiddenTerminals, id] })
  },
  setTerminalsHidden(ids, hidden) {
    const current = new Set(get().hiddenTerminals)
    ids.forEach((id) => (hidden ? current.add(id) : current.delete(id)))
    set({ hiddenTerminals: [...current] })
  },
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
    controls: (def.controls ?? []).filter((item) => !drop.has(item.partId)),
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
