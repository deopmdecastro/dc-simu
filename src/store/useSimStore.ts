import { create } from 'zustand'
import { emptyGrafcet, emptyGrafcetRuntime, scanGrafcet, type GrafcetProgram, type GrafcetRuntime } from '../grafcet/engine'
import { nanoid } from 'nanoid'
import type {
  CircuitState,
  ElectricalComponent,
  LadderRung,
  LadderTag,
  LadderDataType,
  Wire,
  WireColor,
  WireDefaults,
  EditorTool,
  GridSettings,
  SimMode,
  SimEvent,
  FaultState,
  ComponentType,
  ComponentViewOrientation,
  Component3DRenderMode,
  Component3DScale,
  ComponentTerminalViewPosition,
  ComponentTerminalViewPositions,
  Terminal,
  ProbeResult,
  SpatialPoint3D,
} from '../types'
import { logoElectricalInputs } from '../electrical/logoPower'
import { terminalClassesCompatible, terminalElectricalClassOf, TERMINAL_ELECTRICAL_CLASS_LABEL } from '../electrical/terminalClassification'
import { proautoInputPowered } from '../electrical/proautoPower'
import { computeContinuity, isCoilPowered, isLoadPowered, probe, sourceTerminalIds } from '../electrical/engine'
import { computePhaseLabels, motorDirectionFromPhases } from '../electrical/phases'
import { runScan, type AddressTable, type TimerTable, type CounterTable, emptyTable, nextAddress, collectUsedAddresses, defaultDataTypeFor } from '../ladder/ladderEngine'
import { detectDiagnostics } from '../utils/errorDetection'
import { buildMeasurements } from '../utils/measurements'
import { createComponent, createTerminal, nextRef, TEMPLATES, terminalByLabel, upgradeLogoTerminals, upgradePhysicalFootprint, upgradeProauto24A } from '../electrical/factory'
import { terminalPos } from '../schematic/symbols'
import { connectNearWireEnds } from '../schematic/terminalSnap'
import { blankPlcProgram, isProgrammablePlc, programsForSave, type PlcProgram } from '../ladder/plcPrograms'
import type { ProjectFile, ProjectFolder } from '../ladder/projectFiles'
import { plcIoCapacity } from '../ladder/plcIo'
import { parseDataBlocks, type DbTable } from '../ladder/dataBlocks'
import { saveProject, loadProject, deleteProject, setLastOpened } from '../utils/persistence'
import { hasComponent3DModel, SCHEMATIC_PX_PER_MM } from '../three/modelPaths'
import { panelToSchematicX, panelToSchematicY } from '../three/panelLayout'
import { isDinRail, isRailMountable, railSpanMm, railWidthPx, reflowRailChildren, resizeRailGeometry, snapToRail } from '../three/railMount'
import { clampRailLengthMm } from '../three/dinRailGeometry'
import { componentOrientationOf, componentTerminalViewKey, normalizeComponentOrientation, saveDefaultComponent3DPresentation, saveDefaultComponentOrientation, saveDefaultComponentTerminalViewPositions } from '../three/componentOrientation'
import { automaticTerminalViewPositions, componentTerminalLocal, terminal3DFromProjectedLocal } from '../schematic/componentTerminalViews'
import { componentPositionIsFree, nearestFreeComponentPosition, resolveComponentMove } from '../schematic/componentCollision'
import { component3DScaleOf, normalizeComponent3DScale, normalizeTerminal3DPosition, terminal3DPositionOf, type Terminal3DPosition } from '../three/terminal3D'
import { setStoredCover } from '../three/coverCapture'
import { componentEditorChangeLabels, componentEditorSnapshotEquals, componentEditorSnapshotOf, componentEditorVersionOf, nextComponentHistory, previousComponentRevision, upgradeComponentEditorMetadata } from '../three/componentRevisions'

export interface Snapshot {
  components: ElectricalComponent[]
  wires: Wire[]
  ladder: LadderRung[]
  /** Incluído no histórico para que Desfazer/Refazer funcione também no editor GRAFCET. */
  grafcet?: GrafcetProgram
  fcBlocks?: { fc1: LadderRung[]; fc2: LadderRung[] }
  plcPrograms?: Record<string, PlcProgram>
  activePlcId?: string | null
  /** Dados auxiliares do programa Ladder também têm de voltar no mesmo passo.
   *  Sem estes campos, desfazer uma edição de endereço deixava a tag alterada. */
  tags?: LadderTag[]
  plcTags?: Record<string, LadderTag[]>
  projectFiles?: Record<string, ProjectFile[]>
  hiddenProjectFolders?: Record<string, ProjectFolder[]>
}

interface RuntimeExtras {
  table: AddressTable
  timers: TimerTable
  counters: CounterTable
  rungPowered: Record<string, boolean>
  db: DbTable
  plcRuntime: Record<string, { table: AddressTable; timers: TimerTable; counters: CounterTable; rungPowered: Record<string, boolean>; db: DbTable }>
  energizedTerminals: Set<string>
  energizedWires: Set<string>
}

interface Store extends CircuitState {
  runtime: RuntimeExtras
  showEmptyWelcome: boolean
  dismissEmptyWelcome: () => void
  grafcet: GrafcetProgram
  grafcetRuntime: GrafcetRuntime
  setGrafcet: (program: GrafcetProgram, historyMode?: 'auto' | 'force' | 'skip', historyKey?: string) => void
  fcBlocks: Record<'fc1' | 'fc2', LadderRung[]>
  activePlcId: string | null
  plcPrograms: Record<string, PlcProgram>
  plcTags: Record<string, LadderTag[]>
  projectFiles: Record<string, ProjectFile[]>
  /** Pastas opcionais ocultadas pelo utilizador, separadas por PLC. */
  hiddenProjectFolders: Record<string, ProjectFolder[]>
  addProjectFile: (folder: ProjectFolder, name: string) => string | null
  updateProjectFile: (id: string, patch: Partial<Pick<ProjectFile, 'name' | 'content' | 'rungs'>>) => void
  deleteProjectFile: (id: string) => void
  deleteProjectFolder: (folder: ProjectFolder) => void
  restoreProjectFolder: (folder: ProjectFolder) => void
  restoreProjectBackup: (id: string) => boolean
  setActivePlc: (id: string) => void
  updateFc: (id: 'fc1' | 'fc2', rungs: LadderRung[]) => void
  history: Snapshot[]
  future: Snapshot[]
  probeResult: ProbeResult | null
  /** primeiro ponto fixado da sonda (o segundo clique conclui a medição) */
  probeA: string | null
  clipboard: Snapshot | null
  /** Nome do projeto guardado no navegador atualmente aberto (null = projeto
   *  sem nome / carregado de arquivo / cenário pronto — ainda não guardado). */
  currentProjectName: string | null
  setCurrentProjectName: (name: string | null) => void
  /** Guarda o projeto atual no navegador (localStorage) sob este nome, criando
   *  ou sobrescrevendo. Usado pelo Ctrl+S e pelo painel "Projetos". */
  saveProjectAs: (name: string) => boolean
  /** Reabre um projeto guardado anteriormente no navegador. */
  loadProjectByName: (name: string) => boolean
  /** Elimina um projeto guardado no navegador. */
  deleteProjectByName: (name: string) => void
  /** Copia os componentes selecionados (e os cabos entre eles) para a área de
   *  transferência interna (Ctrl+C). */
  copySelection: () => void
  /** Cola o conteúdo copiado, gerando novos ids e mantendo os cabos internos
   *  entre os componentes colados (Ctrl+V). */
  pasteClipboard: () => void

  // --- ciclo de simulação ---
  play: () => void
  pause: () => void
  stop: () => void
  reset: () => void
  setSpeed: (n: number) => void
  setMode: (m: SimMode) => void
  toggleStepMode: () => void
  step: () => void
  setFaults: (patch: Partial<FaultState>) => void
  toggleBlackBox: () => void
  pushEvent: (level: SimEvent['level'], message: string) => void
  _intervalId: number | null

  // --- acionamento de campo ---
  pressButton: (componentId: string, pressed: boolean) => void
  setComponentState: (componentId: string, patch: Record<string, any>) => void
  toggleTerminal: (terminalId: string) => void

  // --- edição (editor completo) ---
  setTool: (t: EditorTool) => void
  gridDragEnabled: boolean
  setGridDragEnabled: (enabled: boolean) => void
  /** Tipo de componente em modo "posicionar com o mouse" (fantasma segue o
   * cursor no esquema; clique posiciona, Esc cancela). */
  placingType: ComponentType | null
  setPlacingType: (t: ComponentType | null) => void
  /** Componente a ser arrastado da biblioteca (HTML5 drag) — usado para o fantasma no esquema */
  dragType: ComponentType | null
  setDragType: (t: ComponentType | null) => void
  /** Editor visual partilhado pelo Esquema e Painel 3D. */
  viewOrientationEditor: {
    componentId: string
    draft: ComponentViewOrientation
    terminalViewPositions: ComponentTerminalViewPositions
    terminals: Terminal[]
    activeTerminalId: string | null
    scale3D: Component3DScale
    renderMode3D: Component3DRenderMode
    bodyColor3D?: string
    /** Diâmetro (px do Esquema) do círculo de rastreamento dos bornes. */
    trackingDiameter: number
    /** Etiquetas dos bornes durante o rastreamento. */
    trackingLabels: 'all' | 'active' | 'off'
    /** Secção aberta no editor (Vista · Bornes · Aparência · Versões). */
    section: ViewEditorSection
  } | null
  openViewOrientationEditor: (componentId: string, section?: ViewEditorSection) => void
  setViewEditorSection: (section: ViewEditorSection) => void
  /** Move um borne no volume 3D (Painel 3D); as vistas 2D passam a seguir o ponto. */
  setViewTerminalPosition3D: (terminalId: string, position: Terminal3DPosition) => void
  setViewOrientationDraft: (orientation: ComponentViewOrientation) => void
  setViewTerminalPosition: (terminalId: string, position: ComponentTerminalViewPosition) => void
  /** Cria/remove bornes apenas no rascunho. Aplicar confirma; Cancelar não altera o projeto. */
  addViewTerminal: (initial?: Partial<Pick<Terminal, 'label' | 'displayName' | 'kind' | 'terminalType' | 'electricalClass' | 'electricalClassCustom' | 'color' | 'x' | 'y' | 'position3D' | 'diameter'>>) => void
  deleteViewTerminal: (terminalId: string) => void
  setViewTerminalDefinition: (terminalId: string, patch: Partial<Terminal>) => void
  setViewActiveTerminal: (terminalId: string | null) => void
  setViewTracking: (patch: { trackingDiameter?: number; trackingLabels?: 'all' | 'active' | 'off' }) => void
  /** Diâmetro do desenho dos bornes: só o ativo ou todos. */
  setViewTerminalDiameter: (diameter: number | undefined, terminalId?: string) => void
  nudgeViewTerminal: (terminalId: string, dx: number, dy: number) => void
  setView3DScale: (scale: Component3DScale) => void
  setView3DRenderMode: (mode: Component3DRenderMode) => void
  setView3DBodyColor: (color?: string) => void
  autoPlaceViewTerminals: () => void
  /** Carrega uma versão anterior no rascunho; Aplicar cria uma nova versão. */
  restoreViewEditorRevision: (version: number) => void
  cancelViewOrientationEditor: () => void
  applyViewOrientationEditor: (saveAsDefault: boolean, note?: string) => void
  /** Preferências aplicadas aos novos cabos (ferramenta Cabo) */
  wireDefaults: WireDefaults
  setWireDefaults: (patch: Partial<WireDefaults>) => void
  addComponent: (type: ComponentType, x: number, y: number) => string | null
  duplicateComponents: (ids: string[]) => void
  updateComponent: (id: string, patch: Partial<ElectricalComponent>) => void
  /** Como `updateComponent`, sem histórico (arrasto contínuo). */
  updateComponentRaw: (id: string, patch: Partial<ElectricalComponent>) => void
  moveComponent: (id: string, x: number, y: number, movingIds?: string[]) => void
  /** Comprimento da calha DIN (mm): mantém Esquema 2D, Painel 3D e equipamentos fixos coerentes. */
  setRailLength: (id: string, lengthMm: number, anchor?: 'left' | 'right', commit?: boolean) => void
  /** Imã: centra na calha mais próxima e fixa. Sem `ids` aplica a todos os equipamentos de calha. Devolve quantos ficaram fixos. */
  snapToRails: (ids?: string[], commit?: boolean) => number
  /** Solta equipamentos da calha (mantém a posição atual). */
  detachFromRail: (ids: string[]) => void
  rotateComponent: (id: string) => void
  mirrorComponent: (id: string) => void
  toggleLock: (id: string) => void
  deleteComponents: (ids: string[]) => void
  selectComponents: (ids: string[], additive?: boolean) => void
  selectWire: (id: string | null) => void
  selectTerminal: (id: string | null) => void
  addTerminal: (componentId: string) => void
  updateTerminal: (terminalId: string, patch: Partial<Terminal>) => void
  deleteTerminal: (terminalId: string) => void
  addWire: (fromTerminalId: string, toTerminalId: string, color?: WireColor, waypoints?: Array<{ x: number; y: number }>) => void
  /** Cabo desenhado no Painel 3D: cada ponta é um borne ou um ponto livre no espaço; devolve o id do cabo. */
  addWire3D: (from: WireEnd3D, to: WireEnd3D, waypoints3D?: SpatialPoint3D[]) => string | null
  addFreeWire: (from: { terminalId?: string; point?: { x: number; y: number } }, to: { terminalId?: string; point?: { x: number; y: number } }, waypoints?: Array<{ x: number; y: number }>) => void
  updateWire: (id: string, patch: Partial<Wire>) => void
  deleteWire: (id: string) => void
  deleteSelection: () => void
  /** Liga em cadeia (t1→t2→t3…) uma lista de bornes selecionados, criando os cabos e
   * já organizando o roteamento entre eles para não se sobreporem. */
  connectChain: (terminalIds: string[]) => void
  /** Reorganiza automaticamente o roteamento/dobra dos cabos (todos, ou apenas os
   * indicados) para reduzir sobreposição — agrupa cabos por canal e distribui a dobra. */
  organizeWires: (wireIds?: string[]) => void
  /** Numera os cabos automaticamente. 'missing' numera só os sem identificação
   * (continuando a sequência existente); 'all' renumera tudo de W1 em diante. */
  autoNumberWires: (mode?: 'missing' | 'all') => void

  // --- alinhamento / distribuição (2+ componentes selecionados) ---
  alignSelection: (edge: 'left' | 'right' | 'top' | 'bottom' | 'centerX' | 'centerY') => void
  distributeSelection: (axis: 'horizontal' | 'vertical') => void

  // --- camadas (ordem de empilhamento: componentes + cabos) ---
  bringSelectionToFront: () => void
  sendSelectionToBack: () => void
  bringSelectionForward: () => void
  sendSelectionBackward: () => void
  runProbe: () => void
  clearProbe: () => void

  // --- malha / vista ---
  setGrid: (patch: Partial<GridSettings>) => void
  setZoom: (z: number) => void
  setPan: (x: number, y: number) => void

  // --- histórico ---
  undo: () => void
  redo: () => void
  commitHistory: () => void

  // --- ladder ---
  addRung: () => string
  deleteRung: (rungId: string) => void
  duplicateRung: (rungId: string) => void
  moveRung: (rungId: string, dir: -1 | 1) => void
  renameRung: (rungId: string, name: string) => void
  updateRung: (rungId: string, updater: (r: LadderRung) => LadderRung, historyMode?: 'auto' | 'force' | 'skip') => void

  // --- tabela de tags (variáveis) ---
  /** Cria uma nova tag no próximo endereço livre da família indicada. */
  addTag: (prefix: 'I' | 'Q' | 'M' | 'T' | 'C') => void
  updateTag: (id: string, patch: Partial<Omit<LadderTag, 'id'>>, historyMode?: 'auto' | 'force' | 'skip') => void
  removeTag: (id: string) => void
  /** Varre o programa Ladder e cria uma tag (nome = endereço) para cada
   *  endereço já usado no programa que ainda não tenha uma tag. */
  autoDetectTags: (historyMode?: 'force' | 'skip') => void

  // --- arquivo ---
  saveJSON: () => string
  loadJSON: (json: string) => void
  newProject: () => void
}

export type WireEnd3D = { terminalId: string } | { point: SpatialPoint3D }

type DrawKey = { kind: 'c' | 'w'; id: string }

/** Agrupa escrita rápida no mesmo campo (nome, comentário ou conteúdo) num
 *  único passo de Desfazer, sem juntar ações discretas como inserir/remover. */
const EDIT_HISTORY_WINDOW_MS = 900
let lastGroupedEdit = { key: '', at: 0 }
function shouldCommitGroupedEdit(key: string): boolean {
  const now = Date.now()
  const commit = key !== lastGroupedEdit.key || now - lastGroupedEdit.at > EDIT_HISTORY_WINDOW_MS
  lastGroupedEdit = { key, at: now }
  return commit
}
function resetGroupedEdit() { lastGroupedEdit = { key: '', at: 0 } }

/** Ordem de empilhamento atual (cabos + componentes), do fundo para a frente,
 * usando o campo `z` (padrão 0) com a ordem de inserção original como
 * critério de desempate — mesma lógica usada pelo SchematicView ao desenhar. */
function currentDrawOrder(components: ElectricalComponent[], wires: Wire[]): DrawKey[] {
  const entries: (DrawKey & { z: number; idx: number })[] = []
  wires.forEach((w, i) => entries.push({ kind: 'w', id: w.id, z: w.z ?? 0, idx: i }))
  components.forEach((c, i) => entries.push({ kind: 'c', id: c.id, z: c.z ?? 0, idx: i + wires.length }))
  entries.sort((a, b) => a.z - b.z || a.idx - b.idx)
  return entries.map(({ kind, id }) => ({ kind, id }))
}

/** Camada de topo para itens novos. Sem isto, um componente criado depois de
 * uma reordenação ficava com z=0 e aparecia atrás de tudo. Devolve undefined
 * enquanto ninguém mexeu nas camadas (mantém o comportamento clássico). */
let lastTrackingDiameter = 16
export type ViewEditorSection = 'orientation' | 'terminals' | 'appearance' | 'versions'

/** Remove os ajustes manuais (por vista) de um borne, para as vistas 2D voltarem a seguir o ponto 3D. */
function withoutManualTerminalPositions(positions: ComponentTerminalViewPositions, terminal: Terminal, index: number, exceptView?: string): ComponentTerminalViewPositions {
  const keys = [terminal.id, `index:${index}`, `label:${terminal.label}`]
  return Object.fromEntries(Object.entries(positions).map(([view, entries]) => [
    view,
    view === exceptView ? entries : Object.fromEntries(Object.entries(entries).filter(([key]) => !keys.includes(key))),
  ]))
}
const clampDiameter = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(value * 2) / 2))

function nextTopZ(components: ElectricalComponent[], wires: Wire[]): number | undefined {
  const zs = [...components.map((c) => c.z), ...wires.map((w) => w.z)].filter((z): z is number => typeof z === 'number')
  return zs.length ? Math.max(...zs) + 1 : undefined
}

/** Grava de volta a ordem (0..n-1) como o novo `z` de cada item. */
function applyDrawOrder(order: DrawKey[], components: ElectricalComponent[], wires: Wire[]) {
  const zByKey = new Map<string, number>()
  order.forEach((k, i) => zByKey.set(`${k.kind}:${k.id}`, i))
  return {
    components: components.map((c) => ({ ...c, z: zByKey.get(`c:${c.id}`) ?? c.z ?? 0 })),
    wires: wires.map((w) => ({ ...w, z: zByKey.get(`w:${w.id}`) ?? w.z ?? 0 })),
  }
}

/** Move os componentes/cabos selecionados para frente/trás (uma camada ou até o topo/fundo). */
function reorderSelection(
  get: () => Store,
  set: (partial: Partial<Store> | ((s: Store) => Partial<Store>)) => void,
  mode: 'front' | 'back' | 'forward' | 'backward',
) {
  const { components, wires, selectedComponentIds, selectedWireId } = get()
  const selKeys = new Set<string>([...selectedComponentIds.map((id) => `c:${id}`), ...(selectedWireId ? [`w:${selectedWireId}`] : [])])
  if (!selKeys.size) return
  const isSel = (k: DrawKey) => selKeys.has(`${k.kind}:${k.id}`)
  let order = currentDrawOrder(components, wires)

  if (mode === 'front') {
    const rest = order.filter((k) => !isSel(k))
    const sel = order.filter(isSel)
    order = [...rest, ...sel]
  } else if (mode === 'back') {
    const rest = order.filter((k) => !isSel(k))
    const sel = order.filter(isSel)
    order = [...sel, ...rest]
  } else if (mode === 'forward') {
    // varre de trás para frente movendo cada item selecionado uma posição à frente,
    // sem ultrapassar outro item selecionado (o bloco selecionado avança junto).
    for (let i = order.length - 2; i >= 0; i--) {
      if (isSel(order[i]) && !isSel(order[i + 1])) {
        ;[order[i], order[i + 1]] = [order[i + 1], order[i]]
      }
    }
  } else {
    for (let i = 1; i < order.length; i++) {
      if (isSel(order[i]) && !isSel(order[i - 1])) {
        ;[order[i - 1], order[i]] = [order[i], order[i - 1]]
      }
    }
  }

  get().commitHistory()
  const patch = applyDrawOrder(order, components, wires)
  set({ ...patch, dirty: true })
}

function snapshot(state: Store): Snapshot {
  const plcTags = { ...state.plcTags, ...(state.activePlcId ? { [state.activePlcId]: state.tags } : {}) }
  return JSON.parse(JSON.stringify({
    components: state.components, wires: state.wires, ladder: state.ladder.rungs,
    grafcet: state.grafcet,
    fcBlocks: state.fcBlocks, activePlcId: state.activePlcId,
    plcPrograms: programsForSave(state.plcPrograms, state.activePlcId, state.ladder.rungs, state.fcBlocks),
    tags: state.tags, plcTags,
    projectFiles: state.projectFiles, hiddenProjectFolders: state.hiddenProjectFolders,
  })) as Snapshot
}

const EMPTY_RUNTIME = (): RuntimeExtras => ({
  table: emptyTable(8, 4),
  timers: {},
  counters: {},
  rungPowered: {},
  db: {},
  plcRuntime: {},
  energizedTerminals: new Set(),
  energizedWires: new Set(),
})

function runOneTick(state: Store, dtMs: number) {
  const { components, wires, ladder, sim } = state
  // Atualizar acessórios DC que têm alimentação física, antes do grafo do scan.
  for (const c of components) if (c.type === 'siemensTsAdapterIeBasic') {
    c.state.powered = logoElectricalInputs(c, components, wires).powered
  }
  // Atualizar fontes AC→DC antes de calcular as fontes do grafo neste scan.
  for (const c of components) if (c.type === 'powerSupplyProauto24A') {
    c.state.powered = proautoInputPowered(c, components, wires)
    // RDY é o contacto normalmente aberto que confirma a saída DC pronta.
    // O motor é binário: não modela a banda de tensão nem atrasos reais.
    c.state.powerReady = c.state.powered
  }
  const srcs = sourceTerminalIds(components, sim.faults)

  // 1) Primeira passagem — apenas chaves físicas (botões, disjuntores, sensores)
  const pass1 = computeContinuity(components, wires, srcs)

  // 2–4) Cada PLC lê os seus bornes, executa o seu OB1 e escreve as suas
  // saídas num espaço I/Q/M/T/C independente. O programa ativo é só a vista.
  const plcs = components.filter(isProgrammablePlc)
  const selectedId = plcs.some((p) => p.id === state.activePlcId) ? state.activePlcId : plcs[0]?.id
  if (!plcs.length) {
    const scan = runScan(ladder, state.runtime.table, state.runtime.timers, state.runtime.counters, dtMs)
    state.runtime.rungPowered = scan.rungPowered
  }
  for (const plc of plcs) {
    const prior = state.runtime.plcRuntime[plc.id] ?? { table: emptyTable(plcIoCapacity(plc).inputs, plcIoCapacity(plc).outputs), timers: {}, counters: {}, rungPowered: {}, db: {} }
    const table = prior.table
    const logo = plc.type === 'plcSiemensLogo1224RC' || plc.type === 'plcLsXbmDn32s'
      ? logoElectricalInputs(plc, components, wires)
      : null
    const powered = logo?.powered ?? true
    if (logo) plc.state.powered = powered
    for (const t of plc.terminals) {
      if (/^I\d+$/.test(t.label)) table[t.label] = logo
        ? powered && logo.positive.has(t.id)
        : pass1.energizedTerminals.has(t.id)
    }
    const program = plc.id === state.activePlcId ? ladder.rungs
      : state.plcPrograms[plc.id]?.rungs ?? (state.activePlcId === null && plc.id === plcs[0].id ? ladder.rungs : [])
    const fc = plc.id === state.activePlcId ? state.fcBlocks : state.plcPrograms[plc.id]
    const functions: Record<string, LadderRung[]> = {
      fc1: fc?.fc1 ?? [], fc2: fc?.fc2 ?? [],
      ...(state.projectFiles[plc.id] ?? []).filter((file) => file.folder === 'programBlocks').reduce((map, file) => ({ ...map, [file.id]: file.rungs ?? [] }), {}),
    }
    const declared = parseDataBlocks(state.projectFiles[plc.id] ?? []).values
    prior.db = { ...declared, ...Object.fromEntries(Object.entries(prior.db).filter(([key]) => key in declared)) }
    const scan = runScan({ rungs: program }, table, prior.timers, prior.counters, dtMs, functions, [], prior.db)
    state.runtime.plcRuntime[plc.id] = { ...prior, rungPowered: scan.rungPowered }
    for (const key of Object.keys(plc.state.outputs)) plc.state.outputs[key] = powered && !!scan.table[key]
  }
  if (selectedId) {
    const active = state.runtime.plcRuntime[selectedId]
    state.runtime.table = active.table
    state.runtime.timers = active.timers
    state.runtime.counters = active.counters
    state.runtime.rungPowered = active.rungPowered
    state.runtime.db = active.db
  }
  // GRAFCET global mantém o comportamento anterior sobre a vista ativa.
  state.grafcetRuntime = scanGrafcet(state.grafcet, state.grafcetRuntime, state.runtime.table)

  // 5) Segunda passagem — agora com as saídas do CLP ativas
  const pass2 = computeContinuity(components, wires, srcs)

  // 6) Coils (contator / relé / temporizador / soft-starter)
  for (const c of components) {
    if (c.type === 'contactor' || c.type === 'contactor4p' || c.type === 'auxRelay' || c.type === 'auxRelay4' || c.type === 'timerRelayTON' || c.type === 'timerRelayTOF' || c.type === 'counterRelay' || c.type === 'safetyRelay' || c.type === 'softStarter') {
      const wants = isCoilPowered(c, pass2.energizedTerminals)
      let finalEnergized = wants
      if (wants && c.state.interlockWith) {
        const partner = components.find((p) => p.id === c.state.interlockWith)
        if (partner?.state.energized) finalEnergized = false
      }
      if (sim.faults.overload && c.type.startsWith('contactor')) {
        // sobrecarga mecânica não desenergiza sozinha, mas registra esforço
      }
      c.state.energized = finalEnergized
    }
  }

  // Temporizador estrela-triângulo dedicado (relé KT)
  for (const c of components) {
    if (c.type === 'timerRelayStarDelta') {
      const wants = isCoilPowered(c, pass2.energizedTerminals)
      c.state.energized = wants
      if (wants) {
        c.state.elapsedMs = Math.min(c.state.presetMs, (c.state.elapsedMs ?? 0) + dtMs)
        c.state.starDone = c.state.elapsedMs >= c.state.presetMs
        c.state.deltaDone = c.state.starDone && c.state.elapsedMs >= c.state.presetMs + (c.state.transitionMs ?? 50)
      } else {
        c.state.elapsedMs = 0
        c.state.starDone = false
        c.state.deltaDone = false
      }
    }
  }

  // 7) Terceira passagem — reflete polos que acabaram de fechar
  const pass3 = computeContinuity(components, wires, srcs)
  state.runtime.energizedTerminals = pass3.energizedTerminals
  state.runtime.energizedWires = pass3.energizedWires

  for (const c of components) for (const t of c.terminals) t.energized = pass3.energizedTerminals.has(t.id)
  for (const w of wires) w.energized = pass3.energizedWires.has(w.id)

  // 8) Sinaleiros / buzzer / torre
  for (const c of components) {
    if (c.type === 'ledGreen' || c.type === 'ledRed' || c.type === 'ledYellow' || c.type === 'ledWhite' || c.type === 'pilotLightAd22' || c.type === 'buzzer') {
      c.state.on = isLoadPowered(c, pass3.energizedTerminals)
    }
    if (c.type === 'towerLight') {
      c.state.red = pass3.energizedTerminals.has(terminalByLabel(c, 'R')?.id ?? '')
      c.state.yellow = pass3.energizedTerminals.has(terminalByLabel(c, 'Y')?.id ?? '')
      c.state.green = pass3.energizedTerminals.has(terminalByLabel(c, 'G')?.id ?? '')
      c.state.on = c.state.red || c.state.yellow || c.state.green
    }
    if (c.type === 'hmi') c.state.on = isLoadPowered(c, pass3.energizedTerminals, 'L', 'N')
    if (c.type === 'analogAmmeter') {
      const live = isLoadPowered(c, pass3.energizedTerminals, '1', '2')
      c.state.reading = live ? Number((c.state.scaleInA * 0.6).toFixed(1)) : 0
    }
  }

  // 9) Motores — sentido real pela sequência de fases
  const thermalTripped = components.some((c) => c.type === 'thermalRelay' && c.state.tripped)
  const phaseLabels = computePhaseLabels(components, wires)
  for (const c of components) {
    if (c.type === 'motor3ph') {
      const dir = motorDirectionFromPhases(c, phaseLabels, pass3.energizedTerminals)
      const u1 = terminalByLabel(c, 'U1')
      const v1 = terminalByLabel(c, 'V1')
      const w1 = terminalByLabel(c, 'W1')
      const live = !!(u1 && v1 && w1 && pass3.energizedTerminals.has(u1.id) && pass3.energizedTerminals.has(v1.id) && pass3.energizedTerminals.has(w1.id))
      c.state.tripped = thermalTripped
      c.state.running = live && !thermalTripped && !sim.faults.phaseLoss
      if (c.state.running) {
        c.state.direction = dir === 'unknown' ? 'cw' : dir
        c.state.rpmVisual = Math.min(1, c.state.rpmVisual + dtMs / 800)
      } else {
        c.state.direction = 'stopped'
        c.state.rpmVisual = Math.max(0, c.state.rpmVisual - dtMs / 500)
      }
    }
    if (c.type === 'motor1ph') {
      const live = isLoadPowered(c, pass3.energizedTerminals, 'U1', 'U2')
      c.state.running = live && !sim.faults.phaseLoss
      c.state.direction = c.state.running ? 'cw' : 'stopped'
      c.state.rpmVisual = c.state.running ? Math.min(1, c.state.rpmVisual + dtMs / 800) : Math.max(0, c.state.rpmVisual - dtMs / 500)
    }
  }

  // 10) Inversor — rampa de frequência
  for (const c of components) {
    if (c.type === 'vfd') {
      const powered = c.terminals.filter((t) => t.label.startsWith('L')).some((t) => pass3.energizedTerminals.has(t.id))
      const started = !!c.state.enabled && powered
      const step = (dtMs / Math.max(200, c.state.rampUpMs ?? 3000)) * (c.state.presetHz ?? 60)
      if (started) c.state.frequencyHz = Math.min(c.state.presetHz ?? 60, (c.state.frequencyHz ?? 0) + step)
      else c.state.frequencyHz = Math.max(0, (c.state.frequencyHz ?? 0) - step)
      c.state.running = started && c.state.frequencyHz > 0.5
    }
  }

  // 11) Diagnósticos + medições
  state.sim.diagnostics = detectDiagnostics(components, wires, pass3.energizedTerminals, sim.faults)
  state.sim.measurements = buildMeasurements(components, wires, pass3.energizedTerminals)
  state.sim.scanCount += 1
}

/** Cor sugerida por função do cabo (usada na cor automática). */
export const WIRE_KIND_COLOR: Record<Wire['kind'], WireColor> = {
  power: 'black',
  control: 'red',
  signal: 'orange',
  neutral: 'lightblue',
  earth: 'green-yellow',
  bus: 'violet',
}

export const useSimStore = create<Store>((set, get) => ({
  components: [],
  wires: [],
  ladder: { rungs: [] },
  tags: [],
  sim: {
    runState: 'stopped',
    mode: 'realtime',
    scanCount: 0,
    speed: 1,
    stepMode: false,
    diagnostics: [],
    faults: { phaseLoss: false, shortCircuit: false, earthLeak: false, overvoltage: false, overload: false },
    events: [],
    measurements: [],
    blackBox: false,
  },
  activeScenario: 'custom',
  selectedComponentIds: [],
  selectedWireId: null,
  selectedTerminalId: null,
  tool: 'select',
  grid: { enabled: true, size: 20, snap: true, style: 'dots', background: '#f8fafd' },
  zoom: 1,
  panX: 0,
  panY: 0,
  dirty: false,
  runtime: EMPTY_RUNTIME(),
  showEmptyWelcome: true,
  dismissEmptyWelcome: () => set({ showEmptyWelcome: false }),
  fcBlocks: { fc1: [], fc2: [] },
  activePlcId: null,
  plcPrograms: {},
  plcTags: {},
  projectFiles: {},
  hiddenProjectFolders: {},
  addProjectFile: (folder, name) => {
    const plcId = get().activePlcId ?? '_general'
    const trimmed = name.trim()
    if (!trimmed) return null
    get().commitHistory()
    const id = nanoid(10)
    const file: ProjectFile = { id, folder, name: trimmed, createdAt: new Date().toISOString(),
      content: folder === 'backups' ? get().saveJSON() : '', ...(folder === 'programBlocks' ? { rungs: [] } : {}) }
    set((s) => ({ projectFiles: { ...s.projectFiles, [plcId]: [...(s.projectFiles[plcId] ?? []), file] }, dirty: true }))
    return id
  },
  updateProjectFile: (id, patch) => {
    const plcId = get().activePlcId ?? '_general'
    if (shouldCommitGroupedEdit(`project-file:${plcId}:${id}`)) get().commitHistory()
    set((s) => ({ projectFiles: { ...s.projectFiles, [plcId]: (s.projectFiles[plcId] ?? []).map((f) => f.id === id ? { ...f, ...patch, name: patch.name !== undefined ? patch.name.trimStart() : f.name } : f) }, dirty: true }))
  },
  deleteProjectFile: (id) => {
    const plcId = get().activePlcId ?? '_general'
    if (!(get().projectFiles[plcId] ?? []).some((file) => file.id === id)) return
    get().commitHistory()
    set((s) => ({ projectFiles: { ...s.projectFiles, [plcId]: (s.projectFiles[plcId] ?? []).filter((f) => f.id !== id) }, dirty: true }))
  },
  deleteProjectFolder: (folder) => {
    // Blocos de programa e variáveis são a estrutura mínima do PLC e não podem ser removidos.
    if (folder === 'programBlocks' || folder === 'plcVariables') return
    const plcId = get().activePlcId ?? '_general'
    if ((get().hiddenProjectFolders[plcId] ?? []).includes(folder)) return
    get().commitHistory()
    set((s) => ({
      projectFiles: { ...s.projectFiles, [plcId]: (s.projectFiles[plcId] ?? []).filter((file) => file.folder !== folder) },
      hiddenProjectFolders: { ...s.hiddenProjectFolders, [plcId]: [...new Set([...(s.hiddenProjectFolders[plcId] ?? []), folder])] },
      dirty: true,
    }))
  },
  restoreProjectFolder: (folder) => {
    const plcId = get().activePlcId ?? '_general'
    if (!(get().hiddenProjectFolders[plcId] ?? []).includes(folder)) return
    get().commitHistory()
    set((s) => ({
      hiddenProjectFolders: { ...s.hiddenProjectFolders, [plcId]: (s.hiddenProjectFolders[plcId] ?? []).filter((item) => item !== folder) },
      dirty: true,
    }))
  },
  restoreProjectBackup: (id) => {
    const plcId = get().activePlcId ?? '_general'
    const file = get().projectFiles[plcId]?.find((f) => f.id === id && f.folder === 'backups')
    if (!file) return false
    get().loadJSON(file.content)
    return true
  },
  setActivePlc: (id) => {
    const state = get()
    if (!state.components.some((c) => c.id === id && isProgrammablePlc(c)) || state.activePlcId === id) return
    const programs = programsForSave(state.plcPrograms, state.activePlcId, state.ladder.rungs, state.fcBlocks)
    const prior = programs[id] ?? (state.activePlcId === null && Object.keys(programs).length === 0
      ? { rungs: state.ladder.rungs, fc1: state.fcBlocks.fc1, fc2: state.fcBlocks.fc2 } : blankPlcProgram())
    const nextRuntime = state.runtime.plcRuntime[id]
    const plcTags = { ...state.plcTags, ...(state.activePlcId ? { [state.activePlcId]: state.tags } : {}) }
    set({ activePlcId: id, plcPrograms: programs, plcTags, tags: plcTags[id] ?? (state.activePlcId === null && Object.keys(plcTags).length === 0 ? state.tags : []), ladder: { rungs: prior.rungs }, fcBlocks: { fc1: prior.fc1, fc2: prior.fc2 },
      runtime: { ...state.runtime, table: nextRuntime?.table ?? emptyTable(8, 4), timers: nextRuntime?.timers ?? {}, counters: nextRuntime?.counters ?? {}, rungPowered: nextRuntime?.rungPowered ?? {}, db: nextRuntime?.db ?? {} },
      history: [], future: [], dirty: true })
    get().step()
  },
  grafcet: emptyGrafcet(),
  grafcetRuntime: emptyGrafcetRuntime(),
  setGrafcet: (program, historyMode = 'force', historyKey = 'grafcet') => {
    if (historyMode === 'force' || (historyMode === 'auto' && shouldCommitGroupedEdit(historyKey))) get().commitHistory()
    if (historyMode === 'force') resetGroupedEdit()
    set({ grafcet: program, dirty: true })
  },
  updateFc: (id, rungs) => {
    get().commitHistory()
    set((state) => ({ fcBlocks: { ...state.fcBlocks, [id]: rungs }, dirty: true }))
  },
  history: [],
  future: [],
  probeResult: null,
  probeA: null,
  clipboard: null,
  currentProjectName: null,
  _intervalId: null,

  // ---------------------------------------------------------------- simulação
  play: () => {
    const existing = get()._intervalId
    if (existing) return
    if (get().sim.runState === 'stopped') set({ grafcetRuntime: emptyGrafcetRuntime() })
    const interval = get().sim.mode === 'turbo' ? 30 : 100
    const iv = window.setInterval(() => {
      const st = get()
      const dt = (st.sim.mode === 'turbo' ? 50 : 100) * st.sim.speed
      runOneTick(st as unknown as Store, dt)
      pushRuntime(set, st)
    }, interval)
    set((s) => ({ sim: { ...s.sim, runState: 'running' }, _intervalId: iv }))
  },

  pause: () => {
    const iv = get()._intervalId
    if (iv) window.clearInterval(iv)
    set((s) => ({ sim: { ...s.sim, runState: 'paused' }, _intervalId: null }))
  },

  stop: () => {
    const iv = get()._intervalId
    if (iv) window.clearInterval(iv)
    set((s) => ({ sim: { ...s.sim, runState: 'stopped' }, _intervalId: null }))
  },

  reset: () => {
    get().stop()
    const state = get()
    const components = state.components.map((component) => {
      const nextState = { ...component.state }
      for (const key of ['energized', 'pressed', 'startPressed', 'stopPressed', 'running', 'done', 'powered', 'powerReady', 'triggered', 'tripped']) {
        if (key in nextState) nextState[key] = false
      }
      for (const key of ['elapsedMs', 'rpmVisual', 'reading', 'count', 'frequencyHz']) {
        if (key in nextState) nextState[key] = 0
      }
      if ('direction' in nextState) nextState.direction = 'stopped'
      for (const key of ['inputs', 'outputs', 'memories']) {
        const table = nextState[key]
        if (table && typeof table === 'object') nextState[key] = Object.fromEntries(Object.keys(table).map((address) => [address, false]))
      }
      return {
        ...component,
        state: nextState,
        terminals: component.terminals.map((terminal) => ({ ...terminal, energized: false })),
      }
    })
    set({
      components,
      wires: state.wires.map((wire) => ({ ...wire, energized: false })),
      runtime: EMPTY_RUNTIME(),
      grafcetRuntime: emptyGrafcetRuntime(),
      sim: {
        ...state.sim,
        runState: 'stopped',
        scanCount: 0,
        diagnostics: [],
        measurements: [],
        faults: { phaseLoss: false, shortCircuit: false, earthLeak: false, overvoltage: false, overload: false },
        events: [{ id: nanoid(6), ts: Date.now(), level: 'info' as const, message: 'Simulação reiniciada sem alterar o projeto.' }, ...state.sim.events].slice(0, 120),
      },
      _intervalId: null,
    })
  },

  setSpeed: (n) => set((s) => ({ sim: { ...s.sim, speed: n } })),
  setMode: (m) => {
    set((s) => ({ sim: { ...s.sim, mode: m, stepMode: m === 'step' } }))
    if (m === 'realtime') get().play()
    else get().pause()
  },
  toggleStepMode: () => set((s) => ({ sim: { ...s.sim, stepMode: !s.sim.stepMode, mode: !s.sim.stepMode ? 'step' : 'realtime' } })),

  step: () => {
    const st = get()
    runOneTick(st as unknown as Store, 100)
    pushRuntime(set, st)
  },

  setFaults: (patch) => {
    set((s) => ({ sim: { ...s.sim, faults: { ...s.sim.faults, ...patch } } }))
    get().step()
  },

  toggleBlackBox: () => set((s) => ({ sim: { ...s.sim, blackBox: !s.sim.blackBox } })),

  pushEvent: (level, message) =>
    set((s) => ({
      sim: {
        ...s.sim,
        events: [{ id: nanoid(6), ts: Date.now(), level, message }, ...s.sim.events].slice(0, 120),
      },
    })),

  // ------------------------------------------------------------- acionamento
  pressButton: (componentId, pressed) => {
    set((s) => {
      const c = s.components.find((x) => x.id === componentId)
      if (c) {
        // Cogumelos de emergência permanecem acionados ao largar. Um novo
        // clique representa o giro/chave de rearme; botoeiras comuns continuam
        // momentâneas e seguem diretamente o estado do ponteiro.
        if (c.state.latched) {
          if (pressed) c.state.pressed = !c.state.pressed
        } else c.state.pressed = pressed
      }
      return { components: [...s.components], dirty: true }
    })
    get().step()
  },

  setComponentState: (componentId, patch) => {
    get().commitHistory()
    set((s) => {
      const c = s.components.find((x) => x.id === componentId)
      if (c) c.state = { ...c.state, ...patch }
      return { components: [...s.components], dirty: true }
    })
    get().step()
  },

  toggleTerminal: (terminalId) => {
    set((s) => {
      for (const c of s.components) {
        const t = c.terminals.find((x) => x.id === terminalId)
        if (t) {
          if (c.type === 'breaker1p' || c.type === 'breakerWegMdwC10' || c.type === 'breaker2p' || c.type === 'breaker3p' || c.type === 'breaker4p' || c.type === 'motorBreaker' || c.type === 'residualBreaker') {
            c.state.closed = !c.state.closed
          } else if (c.type === 'fuse' || c.type === 'fuseHolder') {
            c.state.blown = !c.state.blown
          } else if (c.type === 'thermalRelay') {
            c.state.tripped = !c.state.tripped
          }
        }
      }
      return { components: [...s.components], dirty: true }
    })
    get().step()
  },

  // ------------------------------------------------------------------ edição
  setTool: (t) => set({ tool: t, gridDragEnabled: false, selectedWireId: t === 'select' ? get().selectedWireId : null, selectedTerminalId: null }),
  gridDragEnabled: false,
  setGridDragEnabled: (enabled) => set({ gridDragEnabled: enabled }),

  placingType: null,
  setPlacingType: (t) => {
    const availableType = t && hasComponent3DModel(t) ? t : null
    set({ placingType: availableType, tool: availableType ? 'select' : get().tool })
  },
  dragType: null,
  setDragType: (t) => set({ dragType: t && hasComponent3DModel(t) ? t : null }),
  viewOrientationEditor: null,
  openViewOrientationEditor: (componentId, section = 'orientation') => {
    const component = get().components.find((item) => item.id === componentId)
    if (!component) return
    set({
      viewOrientationEditor: {
        componentId,
        draft: componentOrientationOf(component),
        terminalViewPositions: structuredClone(component.terminalViewPositions ?? {}),
        terminals: structuredClone(component.terminals),
        activeTerminalId: component.terminals[0]?.id ?? null,
        scale3D: component3DScaleOf(component),
        renderMode3D: component.view3DRenderMode ?? 'solid',
        bodyColor3D: component.bodyColor,
        trackingDiameter: lastTrackingDiameter,
        trackingLabels: 'active',
        section,
      },
      selectedComponentIds: [componentId],
      selectedWireId: null,
      selectedTerminalId: null,
    })
  },
  setViewOrientationDraft: (orientation) => set((state) => state.viewOrientationEditor ? {
    viewOrientationEditor: { ...state.viewOrientationEditor, draft: normalizeComponentOrientation(orientation) },
  } : {}),
  setViewEditorSection: (section) => set((state) => state.viewOrientationEditor ? {
    viewOrientationEditor: { ...state.viewOrientationEditor, section },
  } : {}),
  setViewTerminalPosition: (terminalId, position) => set((state) => {
    const editor = state.viewOrientationEditor
    if (!editor || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return {}
    const viewKey = componentTerminalViewKey(editor.draft)
    const component = state.components.find((item) => item.id === editor.componentId)
    const terminalIndex = editor.terminals.findIndex((item) => item.id === terminalId)
    const terminal = editor.terminals[terminalIndex]
    let terminals = editor.terminals
    let viewPositions = editor.terminalViewPositions
    if (component && terminal) {
      // Arrastar no 2D também move o ponto físico (mantendo a profundidade): o 3D fica em sintonia.
      const position3D = terminal3DFromProjectedLocal({ ...component, terminals: editor.terminals }, terminal, editor.draft, { x: position.x * component.w, y: position.y * component.h })
      terminals = editor.terminals.map((item) => (item.id === terminalId ? { ...item, position3D } : item))
      viewPositions = withoutManualTerminalPositions(viewPositions, terminal, terminalIndex, viewKey)
    }
    return {
      viewOrientationEditor: {
        ...editor,
        activeTerminalId: terminalId,
        terminals,
        terminalViewPositions: {
          ...viewPositions,
          [viewKey]: {
            ...(viewPositions[viewKey] ?? {}),
            [terminalId]: { x: position.x, y: position.y },
          },
        },
      },
    }
  }),
  setViewTerminalPosition3D: (terminalId, position3D) => set((state) => {
    const editor = state.viewOrientationEditor
    if (!editor) return {}
    const terminalIndex = editor.terminals.findIndex((item) => item.id === terminalId)
    const terminal = editor.terminals[terminalIndex]
    if (!terminal) return {}
    const next = normalizeTerminal3DPosition(position3D, terminal3DPositionOf(terminal))
    return {
      viewOrientationEditor: {
        ...editor,
        activeTerminalId: terminalId,
        terminals: editor.terminals.map((item) => (item.id === terminalId ? { ...item, position3D: next } : item)),
        terminalViewPositions: withoutManualTerminalPositions(editor.terminalViewPositions, terminal, terminalIndex),
      },
    }
  }),
  addViewTerminal: (initial = {}) => set((state) => {
    const editor = state.viewOrientationEditor
    if (!editor) return {}
    const usedLabels = new Set(editor.terminals.map((terminal) => terminal.label.toLocaleUpperCase()))
    let ordinal = editor.terminals.length + 1
    while (usedLabels.has(`X${ordinal}`)) ordinal += 1
    const label = initial.label?.trim() || `X${ordinal}`
    const terminal = {
      ...createTerminal(editor.componentId, label, initial.kind ?? 'io', initial.x ?? 0.5, initial.y ?? 0.5),
      ...initial,
      label,
      id: `${editor.componentId}-${label}-${nanoid(6)}`,
      componentId: editor.componentId,
      position3D: initial.position3D ? normalizeTerminal3DPosition(initial.position3D, { x: 0.5, y: 0.5, z: 1 }) : { x: 0.5, y: 0.5, z: 1 },
      energized: false,
    }
    return {
      viewOrientationEditor: {
        ...editor,
        terminals: [...editor.terminals, terminal],
        activeTerminalId: terminal.id,
      },
    }
  }),
  deleteViewTerminal: (terminalId) => set((state) => {
    const editor = state.viewOrientationEditor
    const terminalIndex = editor?.terminals.findIndex((terminal) => terminal.id === terminalId) ?? -1
    const removed = terminalIndex >= 0 ? editor?.terminals[terminalIndex] : undefined
    if (!editor || !removed) return {}
    const terminals = editor.terminals.filter((terminal) => terminal.id !== terminalId)
    // Converte chaves legadas por índice/rótulo em IDs antes da remoção, para
    // que os mapas das restantes peças não mudem de dono quando o índice fecha.
    const terminalViewPositions = Object.fromEntries(Object.entries(editor.terminalViewPositions).map(([view, positions]) => [
      view,
      Object.fromEntries(Object.entries(positions).map(([key, position]) => {
        const indexed = key.startsWith('index:') ? editor.terminals[Number(key.slice(6))] : undefined
        const labelled = key.startsWith('label:') ? editor.terminals.find((terminal) => terminal.label === key.slice(6)) : undefined
        return [indexed?.id ?? labelled?.id ?? key, position] as const
      }).filter(([key]) => key !== terminalId)),
    ]))
    return {
      viewOrientationEditor: {
        ...editor,
        terminals,
        terminalViewPositions,
        activeTerminalId: editor.activeTerminalId === terminalId ? (terminals[0]?.id ?? null) : editor.activeTerminalId,
      },
    }
  }),
  setViewTerminalDefinition: (terminalId, patch) => set((state) => {
    const editor = state.viewOrientationEditor
    if (!editor) return {}
    return {
      viewOrientationEditor: {
        ...editor,
        activeTerminalId: terminalId,
        terminals: editor.terminals.map((terminal) => {
          if (terminal.id !== terminalId) return terminal
          const next = {
            ...terminal,
            ...patch,
            id: terminal.id,
            componentId: terminal.componentId,
            energized: terminal.energized,
          }
          if (Object.prototype.hasOwnProperty.call(patch, 'position3D')) {
            next.position3D = patch.position3D
              ? normalizeTerminal3DPosition(patch.position3D, terminal3DPositionOf(terminal))
              : undefined
          }
          return next
        }),
      },
    }
  }),
  setViewActiveTerminal: (terminalId) => set((state) => state.viewOrientationEditor ? {
    viewOrientationEditor: { ...state.viewOrientationEditor, activeTerminalId: terminalId },
  } : {}),
  setViewTracking: (patch) => set((state) => {
    if (!state.viewOrientationEditor) return {}
    const trackingDiameter = patch.trackingDiameter === undefined ? state.viewOrientationEditor.trackingDiameter : clampDiameter(patch.trackingDiameter, 4, 40)
    lastTrackingDiameter = trackingDiameter
    return { viewOrientationEditor: { ...state.viewOrientationEditor, trackingDiameter, trackingLabels: patch.trackingLabels ?? state.viewOrientationEditor.trackingLabels } }
  }),
  setViewTerminalDiameter: (diameter, terminalId) => set((state) => {
    const editor = state.viewOrientationEditor
    if (!editor) return {}
    const value = diameter === undefined ? undefined : clampDiameter(diameter, 3, 24)
    return {
      viewOrientationEditor: {
        ...editor,
        terminals: editor.terminals.map((terminal) => (!terminalId || terminal.id === terminalId ? { ...terminal, diameter: value } : terminal)),
      },
    }
  }),
  nudgeViewTerminal: (terminalId, dx, dy) => {
    const state = get()
    const editor = state.viewOrientationEditor
    const component = editor && state.components.find((item) => item.id === editor.componentId)
    const terminal = editor?.terminals.find((item) => item.id === terminalId)
    if (!editor || !component || !terminal) return
    const current = componentTerminalLocal({ ...component, viewOrientation: editor.draft, terminalViewPositions: editor.terminalViewPositions, terminals: editor.terminals }, terminal)
    get().setViewTerminalPosition(terminalId, { x: (current.x + dx) / component.w, y: (current.y + dy) / component.h })
  },
  setView3DScale: (scale) => set((state) => state.viewOrientationEditor ? {
    viewOrientationEditor: { ...state.viewOrientationEditor, scale3D: normalizeComponent3DScale(scale) },
  } : {}),
  setView3DRenderMode: (mode) => set((state) => state.viewOrientationEditor ? {
    viewOrientationEditor: { ...state.viewOrientationEditor, renderMode3D: mode === 'wireframe' || mode === 'xray' ? mode : 'solid' },
  } : {}),
  setView3DBodyColor: (color) => set((state) => state.viewOrientationEditor ? {
    viewOrientationEditor: { ...state.viewOrientationEditor, bodyColor3D: color && /^#[0-9a-f]{6}$/i.test(color) ? color : undefined },
  } : {}),
  autoPlaceViewTerminals: () => set((state) => {
    const editor = state.viewOrientationEditor
    if (!editor) return {}
    const component = state.components.find((item) => item.id === editor.componentId)
    if (!component) return {}
    const viewKey = componentTerminalViewKey(editor.draft)
    return {
      viewOrientationEditor: {
        ...editor,
        terminalViewPositions: {
          ...editor.terminalViewPositions,
          [viewKey]: automaticTerminalViewPositions({ ...component, terminals: editor.terminals }, editor.draft, editor.trackingDiameter),
        },
      },
    }
  }),
  restoreViewEditorRevision: (version) => set((state) => {
    const editor = state.viewOrientationEditor
    if (!editor) return {}
    const component = state.components.find((item) => item.id === editor.componentId)
    const revision = component?.editorHistory?.find((item) => item.version === version)
    if (!component || !revision) return {}
    return {
      viewOrientationEditor: {
        ...editor,
        draft: normalizeComponentOrientation(revision.viewOrientation),
        terminalViewPositions: structuredClone(revision.terminalViewPositions),
        terminals: structuredClone(revision.terminals).map((terminal) => ({ ...terminal, componentId: component.id, energized: false })),
        activeTerminalId: revision.terminals[0]?.id ?? null,
        scale3D: normalizeComponent3DScale(revision.view3DScale),
        renderMode3D: revision.view3DRenderMode,
        bodyColor3D: revision.bodyColor,
      },
    }
  }),
  cancelViewOrientationEditor: () => set({ viewOrientationEditor: null }),
  applyViewOrientationEditor: (saveAsDefault, note = '') => {
    const editor = get().viewOrientationEditor
    if (!editor) return
    const component = get().components.find((item) => item.id === editor.componentId)
    if (!component) { set({ viewOrientationEditor: null }); return }
    const orientation = normalizeComponentOrientation(editor.draft)
    const terminalViewPositions = structuredClone(editor.terminalViewPositions)
    const terminalDrafts = structuredClone(editor.terminals)
    const scale3D = normalizeComponent3DScale(editor.scale3D)
    const renderMode3D = editor.renderMode3D
    const bodyColor3D = editor.bodyColor3D
    const editedComponent: ElectricalComponent = {
      ...component,
      viewOrientation: orientation,
      terminalViewPositions,
      view3DScale: scale3D,
      view3DRenderMode: renderMode3D,
      bodyColor: bodyColor3D,
      terminals: terminalDrafts,
    }
    const beforeSnapshot = componentEditorSnapshotOf(component)
    const afterSnapshot = componentEditorSnapshotOf(editedComponent)
    const changes = componentEditorChangeLabels(beforeSnapshot, afterSnapshot)
    const changed = !componentEditorSnapshotEquals(beforeSnapshot, afterSnapshot)
    const updatedAt = new Date().toISOString()
    const nextVersion = componentEditorVersionOf(component) + (changed ? 1 : 0)
    const revisionNote = note.trim() || changes.join(' · ') || 'Padrão de apresentação atualizado'
    const history = changed
      ? nextComponentHistory(component, previousComponentRevision(component, updatedAt))
      : component.editorHistory ?? []

    if (saveAsDefault) {
      saveDefaultComponentOrientation(component.type, orientation)
      const terminalIndexes = new Map(terminalDrafts.map((terminal, index) => [terminal.id, index]))
      const reusablePositions = Object.fromEntries(Object.entries(terminalViewPositions).map(([view, positions]) => [view,
        Object.fromEntries(Object.entries(positions).map(([terminalId, position]) => {
          const index = terminalIndexes.get(terminalId)
          return [index === undefined ? terminalId : `index:${index}`, position]
        })),
      ]))
      saveDefaultComponentTerminalViewPositions(component.type, reusablePositions)
      saveDefaultComponent3DPresentation(component.type, { scale: scale3D, renderMode: renderMode3D, bodyColor: bodyColor3D })
    }

    if (changed) get().commitHistory()
    const validTerminalIds = new Set(terminalDrafts.map((terminal) => terminal.id))
    const removedTerminalIds = new Set(component.terminals.map((terminal) => terminal.id).filter((id) => !validTerminalIds.has(id)))
    const removedWireCount = get().wires.filter((wire) => removedTerminalIds.has(wire.fromTerminalId) || removedTerminalIds.has(wire.toTerminalId)).length
    set((state) => ({
      components: changed ? state.components.map((item) => item.id === component.id ? {
        ...item,
        viewOrientation: orientation,
        terminalViewPositions,
        view3DScale: scale3D,
        view3DRenderMode: renderMode3D,
        bodyColor: bodyColor3D,
        editorVersion: nextVersion,
        editorUpdatedAt: updatedAt,
        editorLastChange: revisionNote,
        editorHistory: history,
        // O rascunho é a lista completa: preserva os novos bornes e confirma remoções.
        terminals: terminalDrafts.map((draft) => {
          const current = item.terminals.find((terminal) => terminal.id === draft.id)
          return {
            ...draft,
            componentId: item.id,
            energized: current?.energized ?? false,
          }
        }),
      } : item) : state.components,
      wires: changed && removedTerminalIds.size > 0
        ? state.wires.filter((wire) => !removedTerminalIds.has(wire.fromTerminalId) && !removedTerminalIds.has(wire.toTerminalId))
        : state.wires,
      selectedWireId: state.selectedWireId && state.wires.some((wire) => wire.id === state.selectedWireId && !removedTerminalIds.has(wire.fromTerminalId) && !removedTerminalIds.has(wire.toTerminalId)) ? state.selectedWireId : null,
      selectedTerminalId: state.selectedTerminalId && validTerminalIds.has(state.selectedTerminalId) ? state.selectedTerminalId : null,
      viewOrientationEditor: null,
      dirty: state.dirty || changed,
    }))
    if (changed) get().pushEvent('info', `Componente 3D ${component.ref} guardado como versão ${nextVersion}${saveAsDefault ? ' e padrão para novas instâncias' : ''}.`)
    else if (saveAsDefault) get().pushEvent('info', `Apresentação atual de ${component.ref} guardada como padrão para novas instâncias.`)
    if (removedWireCount > 0) get().pushEvent('warning', `${removedWireCount} cabo(s) ligado(s) a bornes removidos foram eliminados em segurança.`)
  },
  wireDefaults: { autoColor: true, color: 'black', gauge: '1.5mm²', flexibility: 'rigid', endType: 'ferrule' },
  setWireDefaults: (patch) => set((s) => ({ wireDefaults: { ...s.wireDefaults, ...patch } })),

  addComponent: (type, x, y) => {
    if (!hasComponent3DModel(type)) {
      get().pushEvent('warning', `Componente bloqueado: o modelo 3D GLB de ${TEMPLATES[type]?.paletteName ?? type} ainda não está disponível.`)
      return null
    }
    get().commitHistory()
    const comp = createComponent(type, undefined, undefined, get().components.length, x, y)
    const free = nearestFreeComponentPosition(comp, x, y, get().components)
    comp.schematicX = free.x
    comp.schematicY = free.y
    comp.ref = nextRef(get().components, type)
    comp.z = nextTopZ(get().components, get().wires)
    set((s) => ({
      components: [...s.components, comp],
      selectedComponentIds: [comp.id],
      selectedWireId: null,
      dirty: true,
    }))
    get().pushEvent('info', `Componente ${comp.ref} (${comp.label}) adicionado ao esquema.`)
    if (free.displaced) get().pushEvent('warning', `${comp.ref} foi colocado na posição livre mais próxima para evitar sobreposição.`)
    if (get().grid.railMagnet !== false) get().snapToRails([comp.id])
    get().step()
    return comp.id
  },

  duplicateComponents: (ids) => {
    const allowedIds = ids.filter((id) => {
      const source = get().components.find((component) => component.id === id)
      return source ? hasComponent3DModel(source.type) : false
    })
    if (allowedIds.length === 0) {
      if (ids.length > 0) get().pushEvent('warning', 'Duplicação bloqueada: o componente selecionado ainda não possui modelo 3D GLB.')
      return
    }
    if (allowedIds.length < ids.length) get().pushEvent('warning', 'Componentes sem modelo 3D GLB não foram duplicados.')
    get().commitHistory()
    set((s) => {
      const clones: ElectricalComponent[] = []
      for (const id of allowedIds) {
        const src = s.components.find((c) => c.id === id)
        if (!src) continue
        const clone = createComponent(src.type, undefined, src.label, s.components.length + clones.length, src.schematicX + 30, src.schematicY + 30, JSON.parse(JSON.stringify(src.state)))
        clone.ref = nextRef([...s.components, ...clones], src.type)
        const topZ = nextTopZ([...s.components, ...clones], s.wires)
        clone.z = topZ
        clone.mirrored = src.mirrored
        clone.rotation = src.rotation
        if (src.catalog) clone.catalog = { ...src.catalog }
        clone.viewOrientation = componentOrientationOf(src)
        const sourceTerminalIndexes = new Map(src.terminals.map((terminal, index) => [terminal.id, index]))
        clone.terminalViewPositions = Object.fromEntries(Object.entries(src.terminalViewPositions ?? {}).map(([view, positions]) => [view,
          Object.fromEntries(Object.entries(positions).map(([terminalId, position]) => {
            const index = sourceTerminalIndexes.get(terminalId)
            return [index === undefined ? terminalId : `index:${index}`, { ...position }]
          })),
        ]))
        clone.terminals = clone.terminals.map((terminal, index) => {
          const source = src.terminals[index]
          return source ? {
            ...terminal,
            label: source.label,
            displayName: source.displayName,
            kind: source.kind,
            terminalType: source.terminalType,
            color: source.color,
            x: source.x,
            y: source.y,
            position3D: source.position3D ? { ...source.position3D } : undefined,
            pinned: source.pinned,
          } : terminal
        })
        clone.w = src.w
        clone.h = src.h
        clone.bodyColor = src.bodyColor
        clone.view3DScale = component3DScaleOf(src)
        clone.view3DRenderMode = src.view3DRenderMode ?? 'solid'
        clone.panel3DPosition = src.panel3DPosition
          ? { x: src.panel3DPosition.x + 0.35, y: src.panel3DPosition.y, z: src.panel3DPosition.z + 0.18 }
          : undefined
        const free = nearestFreeComponentPosition(clone, clone.schematicX, clone.schematicY, [...s.components, ...clones])
        clone.schematicX = free.x
        clone.schematicY = free.y
        clones.push(clone)
      }
      return { components: [...s.components, ...clones], selectedComponentIds: clones.map((c) => c.id), dirty: true }
    })
    get().step()
  },

  updateComponent: (id, patch) => {
    get().commitHistory()
    const current = get().components.find((c) => c.id === id)
    // Calha: largura (Esquema) e comprimento (mm, usado no 3D) são a mesma grandeza.
    if (current && isDinRail(current) && (patch.w !== undefined || patch.state?.lengthMm !== undefined)) {
      const mm = patch.state?.lengthMm !== undefined ? Number(patch.state.lengthMm) : Number(patch.w) / SCHEMATIC_PX_PER_MM
      const geometry = resizeRailGeometry(current, mm, 'left')
      const { w: _w, state: _state, ...rest } = patch
      get().updateComponentRaw(id, { ...rest, w: geometry.w, state: { ...current.state, ...(patch.state ?? {}), lengthMm: geometry.length } })
      return
    }
    get().updateComponentRaw(id, patch)
  },

  updateComponentRaw: (id, patch) => {
    const current = get().components.find((component) => component.id === id)
    const safePatch: Partial<ElectricalComponent> = { ...patch }
    if (current && (patch.schematicX !== undefined || patch.schematicY !== undefined || patch.w !== undefined || patch.h !== undefined || patch.rotation !== undefined)) {
      const candidate = { ...current, ...patch }
      if (!componentPositionIsFree(candidate, candidate.schematicX, candidate.schematicY, get().components, new Set([id]))) {
        delete safePatch.schematicX
        delete safePatch.schematicY
        delete safePatch.w
        delete safePatch.h
        delete safePatch.rotation
        if (isDinRail(current) && (patch.w !== undefined || patch.schematicX !== undefined)) delete safePatch.state
        get().pushEvent('warning', `${current.ref} manteve a geometria anterior para não entrar noutro componente.`)
      }
    }
    set((s) => {
      let components = s.components.map((c) => (c.id === id ? { ...c, ...safePatch } : c))
      const rail = components.find((c) => c.id === id)
      // Mudou a calha (tamanho/posição): equipamentos fixos acompanham ou ficam dentro dela.
      if (rail && isDinRail(rail) && (safePatch.w !== undefined || safePatch.schematicX !== undefined || safePatch.state !== undefined)) {
        const patches = reflowRailChildren(rail, components)
        if (patches.size) components = components.map((c) => (patches.has(c.id) ? { ...c, ...patches.get(c.id)! } : c))
      }
      return { components, dirty: true }
    })
    get().step()
  },

  moveComponent: (id, x, y, movingIds) => {
    set((s) => {
      const moved = s.components.find((component) => component.id === id)
      if (!moved) return {}
      const groupIds = new Set(movingIds?.length ? movingIds : [id])
      // A calha e os seus equipamentos são um grupo físico durante o arrasto.
      for (const component of s.components) {
        if (component.railId && groupIds.has(component.railId)) groupIds.add(component.id)
      }
      const desiredDx = x - moved.schematicX
      const desiredDy = y - moved.schematicY
      let dx = desiredDx
      let dy = desiredDy
      const constrain = (desired: number, candidate: number) => desired >= 0 ? Math.min(desired, candidate) : Math.max(desired, candidate)
      for (const component of s.components) {
        if (!groupIds.has(component.id)) continue
        const resolved = resolveComponentMove(
          component,
          component.schematicX + desiredDx,
          component.schematicY + desiredDy,
          s.components,
          groupIds,
        )
        dx = constrain(dx, resolved.x - component.schematicX)
        dy = constrain(dy, resolved.y - component.schematicY)
      }
      if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return {}
      return {
        components: s.components.map((component) => groupIds.has(component.id) ? {
          ...component,
          schematicX: component.schematicX + dx,
          schematicY: component.schematicY + dy,
        } : component),
        dirty: true,
      }
    })
  },

  setRailLength: (id, lengthMm, anchor = 'left', commit = true) => {
    const rail = get().components.find((c) => c.id === id)
    if (!rail || !isDinRail(rail)) return
    const children = get().components.filter((component) => component.railId === id)
    const occupiedMm = children.reduce((sum, component) => sum + railSpanMm(component), 0)
      + Math.max(0, children.length - 1) * (4 / SCHEMATIC_PX_PER_MM)
    const safeLengthMm = Math.max(lengthMm, occupiedMm)
    if (safeLengthMm > lengthMm + 0.01) get().pushEvent('warning', 'A calha manteve espaço suficiente para não sobrepor os equipamentos montados.')
    const geometry = resizeRailGeometry(rail, safeLengthMm, anchor)
    if (geometry.length === clampRailLengthMm(rail.state.lengthMm) && geometry.w === rail.w && geometry.schematicX === rail.schematicX) return
    if (commit) get().commitHistory()
    get().updateComponentRaw(id, { w: geometry.w, schematicX: geometry.schematicX, state: { ...rail.state, lengthMm: geometry.length } })
  },

  snapToRails: (ids, commit = false) => {
    const state = get()
    const rails = state.components.filter(isDinRail)
    const targets = state.components.filter((c) => isRailMountable(c) && (!ids || ids.includes(c.id)))
    if (!targets.length) return 0
    if (commit) get().commitHistory()
    let fixed = 0
    let components = state.components
    for (const target of targets) {
      const current = components.find((c) => c.id === target.id)!
      const hit = rails.length ? snapToRail(current, rails, components) : null
      if (hit) fixed++
      const rail = hit ? rails.find((r) => r.id === hit.railId) : undefined
      components = components.map((c) => {
        if (c.id !== target.id) return c
        if (!hit) return c.railId ? { ...c, railId: undefined, railOffsetMm: undefined } : c
        // Sobe acima da calha no empilhamento e limpa a posição 3D manual: passa a derivar da calha.
        const z = rail && typeof rail.z === 'number' && (typeof c.z !== 'number' || c.z <= rail.z) ? rail.z + 1 : c.z
        return { ...c, schematicX: hit.schematicX, schematicY: hit.schematicY, railId: hit.railId, railOffsetMm: hit.railOffsetMm, panel3DPosition: undefined, z }
      })
    }
    set({ components, dirty: true })
    return fixed
  },

  detachFromRail: (ids) => {
    get().commitHistory()
    set((s) => ({
      components: s.components.map((c) => (ids.includes(c.id) && c.railId ? { ...c, railId: undefined, railOffsetMm: undefined } : c)),
      dirty: true,
    }))
  },

  rotateComponent: (id) => {
    const current = get().components.find((component) => component.id === id)
    if (!current) return
    const candidate = { ...current, rotation: ((current.rotation + 90) % 360) as number }
    if (!componentPositionIsFree(candidate, candidate.schematicX, candidate.schematicY, get().components, new Set([id]))) {
      get().pushEvent('warning', `${current.ref} não pode rodar porque entraria noutro componente.`)
      return
    }
    get().commitHistory()
    set((s) => ({ components: s.components.map((component) => (component.id === id ? candidate : component)), dirty: true }))
    get().step()
  },

  mirrorComponent: (id) => {
    get().commitHistory()
    set((s) => ({
      components: s.components.map((c) => (c.id === id ? { ...c, mirrored: !c.mirrored } : c)),
      dirty: true,
    }))
  },

  toggleLock: (id) => {
    get().commitHistory()
    set((s) => ({ components: s.components.map((c) => (c.id === id ? { ...c, locked: !c.locked } : c)), dirty: true }))
  },

  deleteComponents: (ids) => {
    get().commitHistory()
    set((s) => {
      const remaining = s.components.filter((c) => !ids.includes(c.id))
      const deadTerminals = new Set(s.components.filter((c) => ids.includes(c.id)).flatMap((c) => c.terminals.map((t) => t.id)))
      const wires = s.wires.filter((w) => !deadTerminals.has(w.fromTerminalId) && !deadTerminals.has(w.toTerminalId))
      const living = remaining.filter(isProgrammablePlc)
      const programs = programsForSave(s.plcPrograms, s.activePlcId, s.ladder.rungs, s.fcBlocks)
      const keptPrograms = Object.fromEntries(Object.entries(programs).filter(([id]) => living.some((p) => p.id === id)))
      const tags = { ...s.plcTags, ...(s.activePlcId ? { [s.activePlcId]: s.tags } : {}) }
      const keptTags = Object.fromEntries(Object.entries(tags).filter(([id]) => living.some((p) => p.id === id)))
      const nextId = living.some((p) => p.id === s.activePlcId) ? s.activePlcId : living[0]?.id ?? null
      const nextProgram = nextId && nextId !== s.activePlcId ? keptPrograms[nextId] ?? blankPlcProgram() : null
      return { components: remaining.map((c) => (c.railId && ids.includes(c.railId) ? { ...c, railId: undefined, railOffsetMm: undefined } : c)), wires, selectedComponentIds: [], dirty: true,
        viewOrientationEditor: s.viewOrientationEditor && ids.includes(s.viewOrientationEditor.componentId) ? null : s.viewOrientationEditor,
        activePlcId: nextId, plcPrograms: keptPrograms, plcTags: keptTags,
        projectFiles: Object.fromEntries(Object.entries(s.projectFiles).filter(([id]) => id === '_general' || living.some((p) => p.id === id))),
        hiddenProjectFolders: Object.fromEntries(Object.entries(s.hiddenProjectFolders).filter(([id]) => id === '_general' || living.some((p) => p.id === id))),
        ...(nextProgram ? { tags: keptTags[nextId!] ?? [], ladder: { rungs: nextProgram.rungs }, fcBlocks: { fc1: nextProgram.fc1, fc2: nextProgram.fc2 }, history: [], future: [] } : {}),
      }
    })
    get().step()
  },

  selectComponents: (ids, additive = false) =>
    set((s) => ({
      selectedComponentIds: additive ? [...new Set([...s.selectedComponentIds, ...ids])] : ids,
      selectedWireId: null,
      selectedTerminalId: null,
      viewOrientationEditor: s.viewOrientationEditor && !ids.includes(s.viewOrientationEditor.componentId) ? null : s.viewOrientationEditor,
    })),

  selectWire: (id) => set({ selectedWireId: id, selectedComponentIds: [], selectedTerminalId: null, viewOrientationEditor: null }),
  selectTerminal: (id) => set({ selectedTerminalId: id, selectedWireId: null, selectedComponentIds: [], viewOrientationEditor: null }),

  addTerminal: (componentId) => {
    get().commitHistory()
    set((s) => ({
      components: s.components.map((c) => {
        if (c.id !== componentId) return c
        const n = c.terminals.length + 1
        const term = createTerminal(c.id, `X${n}`, 'io', 0.1 + (n % 5) * 0.15, n % 2 ? 0.85 : 0.15)
        return { ...c, terminals: [...c.terminals, term] }
      }),
      dirty: true,
    }))
  },

  updateTerminal: (terminalId, patch) => {
    const fields = Object.keys(patch).sort().join(',') || 'definition'
    if (shouldCommitGroupedEdit(`terminal:${terminalId}:${fields}`)) get().commitHistory()
    set((s) => ({
      components: s.components.map((c) => ({
        ...c,
        terminals: c.terminals.map((t) => (t.id === terminalId ? { ...t, ...patch } : t)),
      })),
      dirty: true,
    }))
    get().step()
  },

  deleteTerminal: (terminalId) => {
    get().commitHistory()
    set((s) => ({
      components: s.components.map((c) => ({ ...c, terminals: c.terminals.filter((t) => t.id !== terminalId) })),
      wires: s.wires.filter((w) => w.fromTerminalId !== terminalId && w.toTerminalId !== terminalId),
      selectedTerminalId: null,
      dirty: true,
    }))
    get().step()
  },

  addWire: (fromTerminalId, toTerminalId, color, waypoints) => {
    if (fromTerminalId === toTerminalId) return
    const exists = get().wires.some(
      (w) =>
        (w.fromTerminalId === fromTerminalId && w.toTerminalId === toTerminalId) ||
        (w.fromTerminalId === toTerminalId && w.toTerminalId === fromTerminalId),
    )
    if (exists) return
    get().commitHistory()
    const defs = get().wireDefaults
    const wire: Wire = {
      id: nanoid(8),
      fromTerminalId,
      toTerminalId,
      waypoints,
      color: color ?? defs.color,
      gauge: defs.gauge,
      kind: 'control',
      flexibility: defs.flexibility,
      endType: defs.endType,
      fromEndType: defs.endType, toEndType: defs.endType,
      fromEndLayer: 'back', toEndLayer: 'back',
      route: 'orthogonal',
      bend: 0.5,
      curveOffset: 0,
      number: `W${get().wires.length + 1}`,
      energized: false,
    }
    // heurística: cabo entre polos de força = 'power'; entre N/PE = neutral/earth
    const labelOf = (tid: string) => {
      for (const c of get().components) {
        const terminal = c.terminals.find((candidate) => candidate.id === tid)
        if (terminal) return { kind: terminal.kind, terminal, comp: c, electricalClass: terminalElectricalClassOf(c, terminal) }
      }
      return null
    }
    const a = labelOf(fromTerminalId)
    const b = labelOf(toTerminalId)
    if (a?.kind === 'power-in' || a?.kind === 'power-out' || b?.kind === 'power-in' || b?.kind === 'power-out') wire.kind = 'power'
    if (a?.kind === 'neutral' || b?.kind === 'neutral') wire.kind = 'neutral'
    if (a?.kind === 'earth' || b?.kind === 'earth') wire.kind = 'earth'
    if (a?.kind === 'io' || b?.kind === 'io') wire.kind = 'signal'
    if (a?.electricalClass === 'network' || b?.electricalClass === 'network') wire.kind = 'bus'
    // cor automática pela função (IEC 60204-1): força preto, comando vermelho,
    // neutro azul-claro, PE verde-amarelo, sinal laranja, bus violeta
    if (!color && defs.autoColor) wire.color = WIRE_KIND_COLOR[wire.kind]

    set((s) => ({ wires: [...s.wires, wire], selectedWireId: wire.id, dirty: true }))
    get().pushEvent('info', `Cabo ${wire.number} criado (${a?.comp.ref ?? '?'} → ${b?.comp.ref ?? '?'}).`)
    if (a && b && !terminalClassesCompatible(a.electricalClass, b.electricalClass)) {
      get().pushEvent('warning', `Verifique ${wire.number}: ${TERMINAL_ELECTRICAL_CLASS_LABEL[a.electricalClass]} ligado a ${TERMINAL_ELECTRICAL_CLASS_LABEL[b.electricalClass]}.`)
    }
    get().step()
  },

  addFreeWire: (from, to, waypoints) => {
    if ((!from.point && !from.terminalId) || (!to.point && !to.terminalId)) return
    if (from.point && to.point && Math.hypot(from.point.x - to.point.x, from.point.y - to.point.y) < 5) return
    const defs = get().wireDefaults
    get().commitHistory()
    const wire: Wire = {
      id: nanoid(8), fromTerminalId: from.terminalId ?? '', toTerminalId: to.terminalId ?? '',
      fromPoint: from.point, toPoint: to.point, waypoints,
      color: defs.color, gauge: defs.gauge, kind: 'control', flexibility: defs.flexibility,
      endType: defs.endType, fromEndType: defs.endType, toEndType: defs.endType,
      fromEndLayer: 'back', toEndLayer: 'back', route: 'orthogonal', bend: 0.5, curveOffset: 0,
      number: `W${get().wires.length + 1}`, energized: false,
    }
    set((state) => ({ wires: [...state.wires, wire], selectedWireId: wire.id, dirty: true }))
    get().pushEvent('info', `Cabo livre ${wire.number} criado (sem continuidade elétrica até ligar ambas as pontas).`)
    get().step()
  },

  addWire3D: (from, to, waypoints3D) => {
    const fromId = 'terminalId' in from ? from.terminalId : ''
    const toId = 'terminalId' in to ? to.terminalId : ''
    const path = waypoints3D && waypoints3D.length ? waypoints3D : undefined
    if (fromId && toId) {
      if (fromId === toId) return null
      const before = new Set(get().wires.map((w) => w.id))
      get().addWire(fromId, toId)
      const created = get().wires.find((w) => !before.has(w.id))
      if (!created) {
        get().pushEvent('warning', 'Já existe um cabo entre estes dois bornes.')
        return null
      }
      if (path) set((s) => ({ wires: s.wires.map((w) => (w.id === created.id ? { ...w, waypoints3D: path } : w)) }))
      return created.id
    }
    const project = (p: SpatialPoint3D) => ({ x: Math.round(panelToSchematicX(p.x)), y: Math.round(panelToSchematicY(p.y)) })
    const defs = get().wireDefaults
    get().commitHistory()
    const wire: Wire = {
      id: nanoid(8),
      fromTerminalId: fromId,
      toTerminalId: toId,
      fromPoint: 'point' in from ? project(from.point) : undefined,
      toPoint: 'point' in to ? project(to.point) : undefined,
      fromPoint3D: 'point' in from ? from.point : undefined,
      toPoint3D: 'point' in to ? to.point : undefined,
      waypoints3D: path,
      color: defs.color, gauge: defs.gauge, kind: 'control', flexibility: defs.flexibility,
      endType: defs.endType, fromEndType: defs.endType, toEndType: defs.endType,
      fromEndLayer: 'back', toEndLayer: 'back', route: 'orthogonal', bend: 0.5, curveOffset: 0,
      number: `W${get().wires.length + 1}`, energized: false,
    }
    set((state) => ({ wires: [...state.wires, wire], selectedWireId: wire.id, dirty: true }))
    get().pushEvent('info', `Cabo livre ${wire.number} desenhado no 3D (sem continuidade elétrica até ligar ambas as pontas).`)
    get().step()
    return wire.id
  },

  updateWire: (id, patch) => {
    set((s) => ({ wires: s.wires.map((w) => (w.id === id ? { ...w, ...patch } : w)), dirty: true }))
  },

  deleteWire: (id) => {
    get().commitHistory()
    set((s) => ({ wires: s.wires.filter((w) => w.id !== id), selectedWireId: null, dirty: true }))
    get().step()
  },

  connectChain: (terminalIds) => {
    const ids = terminalIds.filter((id, i) => terminalIds.indexOf(id) === i)
    if (ids.length < 2) return
    const before = new Set(get().wires.map((w) => w.id))
    for (let i = 0; i < ids.length - 1; i++) {
      get().addWire(ids[i], ids[i + 1])
    }
    const created = get().wires.filter((w) => !before.has(w.id)).map((w) => w.id)
    if (created.length) get().organizeWires(created)
    get().pushEvent('info', `Ligação inteligente: ${ids.length} bornes conectados em cadeia (${created.length} cabo(s)).`)
  },

  organizeWires: (wireIds) => {
    get().commitHistory()
    const { components, wires } = get()
    const posOf = (tid: string) => {
      for (const c of components) {
        const t = c.terminals.find((x) => x.id === tid)
        if (t) return terminalPos(c, t)
      }
      return null
    }
    const target = wireIds && wireIds.length ? wires.filter((w) => wireIds.includes(w.id)) : wires
    // agrupa cabos que compartilham o mesmo "canal" (mesma faixa horizontal/vertical
    // aproximada entre os pontos médios) para distribuir a dobra e evitar sobreposição.
    const groups = new Map<string, { id: string; horizontal: boolean }[]>()
    for (const w of target) {
      const a = posOf(w.fromTerminalId)
      const b = posOf(w.toTerminalId)
      if (!a || !b) continue
      const dx = Math.abs(b.x - a.x)
      const dy = Math.abs(b.y - a.y)
      const horizontal = dx >= dy
      const channel = horizontal ? Math.round((a.y + b.y) / 2 / 24) : Math.round((a.x + b.x) / 2 / 24)
      const key = `${horizontal ? 'h' : 'v'}:${channel}`
      const arr = groups.get(key) ?? []
      arr.push({ id: w.id, horizontal })
      groups.set(key, arr)
    }
    const patches: Record<string, Partial<Wire>> = {}
    for (const arr of groups.values()) {
      const n = arr.length
      arr.forEach((entry, i) => {
        // espalha as dobras entre 0.2 e 0.8 quando há mais de um cabo no mesmo canal,
        // senão usa 0.5 (dobra central); mantém roteamento ortogonal/manhattan conforme
        // a orientação predominante do cabo para evitar diagonais cruzadas.
        const bend = n === 1 ? 0.5 : 0.2 + (0.6 * i) / (n - 1)
        patches[entry.id] = { bend, route: entry.horizontal ? 'orthogonal' : 'manhattan', curveOffset: 0, waypoints: undefined }
      })
    }
    set((s) => ({
      wires: s.wires.map((w) => (patches[w.id] ? { ...w, ...patches[w.id] } : w)),
      dirty: true,
    }))
    get().pushEvent('info', `Cabos organizados automaticamente (${Object.keys(patches).length}).`)
  },

  autoNumberWires: (mode = 'missing') => {
    if (!get().wires.length) return
    get().commitHistory()
    set((s) => {
      let n = 0
      if (mode === 'missing') {
        const used = s.wires
          .map((w) => (w.number ? /^W(\d+)$/.exec(w.number) : null))
          .filter((m): m is RegExpExecArray => !!m)
          .map((m) => Number(m[1]))
        n = used.length ? Math.max(...used) : 0
      }
      return {
        wires: s.wires.map((w) => {
          if (mode === 'missing' && w.number) return w
          n += 1
          return { ...w, number: `W${n}` }
        }),
        dirty: true,
      }
    })
    get().pushEvent(
      'info',
      mode === 'all' ? `Todos os cabos renumerados (W1…W${get().wires.length}).` : 'Cabos sem identificação foram numerados automaticamente.',
    )
  },

  // ------------------------------------------------------- alinhar / distribuir
  alignSelection: (edge) => {
    const { selectedComponentIds, components } = get()
    const sel = components.filter((c) => selectedComponentIds.includes(c.id))
    if (sel.length < 2) return

    let target: number
    switch (edge) {
      case 'left':
        target = Math.min(...sel.map((c) => c.schematicX))
        break
      case 'right':
        target = Math.max(...sel.map((c) => c.schematicX + c.w))
        break
      case 'top':
        target = Math.min(...sel.map((c) => c.schematicY))
        break
      case 'bottom':
        target = Math.max(...sel.map((c) => c.schematicY + c.h))
        break
      case 'centerX':
        target = sel.reduce((a, c) => a + c.schematicX + c.w / 2, 0) / sel.length
        break
      case 'centerY':
      default:
        target = sel.reduce((a, c) => a + c.schematicY + c.h / 2, 0) / sel.length
        break
    }

    const ids = new Set(selectedComponentIds)
    const next = components.map((component) => {
      if (!ids.has(component.id)) return component
      switch (edge) {
        case 'left':
          return { ...component, schematicX: target }
        case 'right':
          return { ...component, schematicX: target - component.w }
        case 'top':
          return { ...component, schematicY: target }
        case 'bottom':
          return { ...component, schematicY: target - component.h }
        case 'centerX':
          return { ...component, schematicX: target - component.w / 2 }
        case 'centerY':
        default:
          return { ...component, schematicY: target - component.h / 2 }
      }
    })
    const valid = next.every((component) => !ids.has(component.id)
      || componentPositionIsFree(component, component.schematicX, component.schematicY, next, new Set([component.id])))
    if (!valid) {
      get().pushEvent('warning', 'Alinhamento cancelado: os componentes ficariam sobrepostos.')
      return
    }
    get().commitHistory()
    set({ components: next, dirty: true })
    get().step()
  },

  distributeSelection: (axis) => {
    const { selectedComponentIds, components } = get()
    const sel = components.filter((c) => selectedComponentIds.includes(c.id))
    if (sel.length < 3) return
    get().commitHistory()

    const posKey = axis === 'horizontal' ? 'schematicX' : 'schematicY'
    const sizeKey = axis === 'horizontal' ? 'w' : 'h'
    const sorted = [...sel].sort((a, b) => a[posKey] - b[posKey])
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const span = last[posKey] + last[sizeKey] - first[posKey]
    const totalSize = sorted.reduce((a, c) => a + c[sizeKey], 0)
    const gap = (span - totalSize) / (sorted.length - 1)

    const patch = new Map<string, number>()
    let cursor = first[posKey]
    for (const c of sorted) {
      patch.set(c.id, cursor)
      cursor += c[sizeKey] + gap
    }

    const next = components.map((component) => patch.has(component.id) ? { ...component, [posKey]: patch.get(component.id)! } : component)
    const ids = new Set(selectedComponentIds)
    const valid = next.every((component) => !ids.has(component.id)
      || componentPositionIsFree(component, component.schematicX, component.schematicY, next, new Set([component.id])))
    if (!valid) {
      get().pushEvent('warning', 'Distribuição cancelada: não existe folga suficiente entre os componentes.')
      return
    }
    get().commitHistory()
    set({ components: next, dirty: true })
    get().pushEvent('info', `Distribuição ${axis === 'horizontal' ? 'horizontal' : 'vertical'} aplicada a ${sorted.length} componentes.`)
    get().step()
  },

  // ------------------------------------------------------------ camadas
  bringSelectionToFront: () => reorderSelection(get, set, 'front'),
  sendSelectionToBack: () => reorderSelection(get, set, 'back'),
  bringSelectionForward: () => reorderSelection(get, set, 'forward'),
  sendSelectionBackward: () => reorderSelection(get, set, 'backward'),

  deleteSelection: () => {
    const { selectedComponentIds, selectedWireId, selectedTerminalId } = get()
    if (selectedTerminalId) return get().deleteTerminal(selectedTerminalId)
    if (selectedWireId) return get().deleteWire(selectedWireId)
    if (selectedComponentIds.length) return get().deleteComponents(selectedComponentIds)
  },

  runProbe: () => {
    const st = get()
    const segundo = st.selectedTerminalId
    if (!segundo) return
    const primeiro = st.probeA
    if (!primeiro || primeiro === segundo) {
      set({
        probeA: segundo,
        probeResult: { a: segundo, b: null, connected: false, hops: -1, resistanceOhm: null, voltage: '—', note: 'Primeiro ponto fixado. Clique no segundo ponto para medir.' },
      })
      return
    }
    set({ probeA: null, probeResult: probe(st.components, st.wires, primeiro, segundo, st.runtime.energizedTerminals) })
  },

  clearProbe: () => set({ probeResult: null, probeA: null }),

  // -------------------------------------------------------------------- vista
  setGrid: (patch) => set((s) => ({ grid: { ...s.grid, ...patch }, dirty: true })),
  setZoom: (z) => set({ zoom: Math.min(3, Math.max(0.25, z)) }),
  setPan: (x, y) => set({ panX: x, panY: y }),

  // ---------------------------------------------------------------- histórico
  commitHistory: () => {
    const s = get()
    set({
      history: [...s.history.slice(-49), snapshot(s)],
      future: [],
    })
  },

  undo: () => {
    const s = get()
    if (!s.history.length) return
    const prev = s.history[s.history.length - 1]
    set({
      components: prev.components,
      wires: prev.wires,
      ladder: { rungs: prev.ladder },
      grafcet: prev.grafcet ?? s.grafcet,
      fcBlocks: prev.fcBlocks ?? s.fcBlocks,
      plcPrograms: prev.plcPrograms ?? s.plcPrograms,
      activePlcId: prev.activePlcId !== undefined ? prev.activePlcId : s.activePlcId,
      tags: prev.tags ?? s.tags,
      plcTags: prev.plcTags ?? s.plcTags,
      projectFiles: prev.projectFiles ?? s.projectFiles,
      hiddenProjectFolders: prev.hiddenProjectFolders ?? s.hiddenProjectFolders,
      history: s.history.slice(0, -1),
      future: [...s.future, snapshot(s)],
      dirty: true,
    })
    get().step()
  },

  redo: () => {
    const s = get()
    if (!s.future.length) return
    const next = s.future[s.future.length - 1]
    set({
      components: next.components,
      wires: next.wires,
      ladder: { rungs: next.ladder },
      grafcet: next.grafcet ?? s.grafcet,
      fcBlocks: next.fcBlocks ?? s.fcBlocks,
      plcPrograms: next.plcPrograms ?? s.plcPrograms,
      activePlcId: next.activePlcId !== undefined ? next.activePlcId : s.activePlcId,
      tags: next.tags ?? s.tags,
      plcTags: next.plcTags ?? s.plcTags,
      projectFiles: next.projectFiles ?? s.projectFiles,
      hiddenProjectFolders: next.hiddenProjectFolders ?? s.hiddenProjectFolders,
      future: s.future.slice(0, -1),
      history: [...s.history, snapshot(s)],
      dirty: true,
    })
    get().step()
  },

  // ------------------------------------------------------------------- ladder
  addRung: () => {
    get().commitHistory()
    const rungId = nanoid(6)
    resetGroupedEdit()
    set((s) => ({
      ladder: { rungs: [...s.ladder.rungs, { id: rungId, name: `Rung ${s.ladder.rungs.length + 1}`, branches: [{ id: nanoid(6), elements: [] }], coils: [], enabled: true }] },
      dirty: true,
    }))
    get().step()
    return rungId
  },

  deleteRung: (rungId) => {
    get().commitHistory()
    set((s) => ({ ladder: { rungs: s.ladder.rungs.filter((r) => r.id !== rungId) }, dirty: true }))
    get().step()
  },

  duplicateRung: (rungId) => {
    get().commitHistory()
    set((s) => {
      const idx = s.ladder.rungs.findIndex((r) => r.id === rungId)
      if (idx === -1) return s
      const clone: LadderRung = JSON.parse(JSON.stringify(s.ladder.rungs[idx]))
      clone.id = nanoid(6)
      clone.name = clone.name + ' (cópia)'
      const rungs = [...s.ladder.rungs]
      rungs.splice(idx + 1, 0, clone)
      return { ladder: { rungs }, dirty: true }
    })
    get().step()
  },

  moveRung: (rungId, dir) => {
    const current = get().ladder.rungs
    const index = current.findIndex((rung) => rung.id === rungId)
    const swapWith = index + dir
    if (index === -1 || swapWith < 0 || swapWith >= current.length) return
    get().commitHistory()
    set((s) => {
      const rungs = [...s.ladder.rungs]
      ;[rungs[index], rungs[swapWith]] = [rungs[swapWith], rungs[index]]
      return { ladder: { rungs }, dirty: true }
    })
    get().step()
  },

  renameRung: (rungId, name) => {
    if (shouldCommitGroupedEdit(`rung:${rungId}:name`)) get().commitHistory()
    set((s) => ({ ladder: { rungs: s.ladder.rungs.map((r) => (r.id === rungId ? { ...r, name } : r)) }, dirty: true }))
  },

  updateRung: (rungId, updater, historyMode = 'auto') => {
    if (historyMode === 'force' || (historyMode === 'auto' && shouldCommitGroupedEdit(`rung:${rungId}`))) get().commitHistory()
    if (historyMode === 'force') resetGroupedEdit()
    set((s) => ({ ladder: { rungs: s.ladder.rungs.map((r) => (r.id === rungId ? updater(r) : r)) }, dirty: true }))
    get().step()
  },

  // ------------------------------------------------------------- tabela de tags
  addTag: (prefix) => {
    const addr = nextAddress(prefix, get().runtime.table)
    get().commitHistory()
    resetGroupedEdit()
    set((s) => ({
      tags: [...s.tags, { id: nanoid(6), address: addr, name: addr, dataType: defaultDataTypeFor(addr) as LadderDataType, comment: '' }],
      dirty: true,
    }))
  },

  updateTag: (id, patch, historyMode = 'auto') => {
    if (!get().tags.some((tag) => tag.id === id)) return
    if (historyMode === 'force' || (historyMode === 'auto' && shouldCommitGroupedEdit(`tag:${id}`))) get().commitHistory()
    if (historyMode === 'force') resetGroupedEdit()
    set((s) => ({
      tags: s.tags.map((t) => (t.id === id ? { ...t, ...patch, ...(patch.address ? { address: patch.address.toUpperCase() } : {}) } : t)),
      dirty: true,
    }))
  },

  removeTag: (id) => {
    if (!get().tags.some((tag) => tag.id === id)) return
    get().commitHistory()
    resetGroupedEdit()
    set((s) => ({ tags: s.tags.filter((t) => t.id !== id), dirty: true }))
  },

  autoDetectTags: (historyMode = 'force') => {
    const state = get()
    const known = new Set(state.tags.map((tag) => tag.address))
    const used = collectUsedAddresses(state.ladder).filter((address) => !known.has(address))
    if (!used.length) return
    if (historyMode === 'force') { state.commitHistory(); resetGroupedEdit() }
    const added: LadderTag[] = used.map((address) => ({
      id: nanoid(6),
      address,
      name: address,
      dataType: defaultDataTypeFor(address) as LadderDataType,
      comment: '',
    }))
    set((s) => ({ tags: [...s.tags, ...added], ...(historyMode === 'force' ? { dirty: true } : {}) }))
  },

  // ------------------------------------------------------------------ arquivo
  saveJSON: () => {
    const s = get()
    return JSON.stringify(
      {
        app: 'dc-simu',
        version: 6,
        savedAt: new Date().toISOString(),
        components: s.components,
        wires: s.wires,
        ladder: s.ladder,
        fcBlocks: s.fcBlocks,
        activePlcId: s.activePlcId,
        plcPrograms: programsForSave(s.plcPrograms, s.activePlcId, s.ladder.rungs, s.fcBlocks),
        plcTags: { ...s.plcTags, ...(s.activePlcId ? { [s.activePlcId]: s.tags } : {}) },
        projectFiles: s.projectFiles,
        hiddenProjectFolders: s.hiddenProjectFolders,
        grafcet: s.grafcet,
        tags: s.tags,
        grid: s.grid,
        activeScenario: s.activeScenario,
      },
      null,
      2,
    )
  },

  loadJSON: (json) => {
    try {
      const parsed = JSON.parse(json)
      setStoredCover(parsed?.cover)
      get().stop()
      const sourceComponents = (parsed.components ?? []) as ElectricalComponent[]
      const loadedComponents = sourceComponents.map(upgradeLogoTerminals).map(upgradeProauto24A).map(upgradePhysicalFootprint)
        .map((component) => upgradeComponentEditorMetadata(component, parsed.savedAt)) as ElectricalComponent[]
      const componentMetadataUpgraded = loadedComponents.some((component, index) => component.editorVersion !== sourceComponents[index]?.editorVersion
        || component.editorUpdatedAt !== sourceComponents[index]?.editorUpdatedAt || component.editorLastChange !== sourceComponents[index]?.editorLastChange)
      const footprintUpgraded = loadedComponents.some((component, index) => component.w !== sourceComponents[index]?.w || component.h !== sourceComponents[index]?.h)
      const loadedWires = (parsed.wires ?? []) as Wire[]
      const alignedWires = connectNearWireEnds(loadedComponents, loadedWires)
      const plcIds = loadedComponents.filter(isProgrammablePlc).map((c) => c.id)
      const loadedActiveId = plcIds.includes(parsed.activePlcId) ? parsed.activePlcId : plcIds[0] ?? null
      const programs = (parsed.plcPrograms ?? {}) as Record<string, PlcProgram>
      const activeProgram = loadedActiveId && programs[loadedActiveId]
      set({
        components: loadedComponents,
        showEmptyWelcome: false,
        wires: alignedWires,
        ladder: { rungs: activeProgram?.rungs ?? parsed.ladder?.rungs ?? [] },
        fcBlocks: { fc1: activeProgram?.fc1 ?? parsed.fcBlocks?.fc1 ?? [], fc2: activeProgram?.fc2 ?? parsed.fcBlocks?.fc2 ?? [] },
        activePlcId: loadedActiveId,
        plcPrograms: programs,
        plcTags: parsed.plcTags ?? {},
        projectFiles: parsed.projectFiles ?? {},
        hiddenProjectFolders: parsed.hiddenProjectFolders ?? {},
        grafcet: parsed.grafcet?.steps && Array.isArray(parsed.grafcet.steps) ? parsed.grafcet : emptyGrafcet(),
        grafcetRuntime: emptyGrafcetRuntime(),
        tags: (loadedActiveId && parsed.plcTags?.[loadedActiveId]) ?? parsed.tags ?? [],
        grid: parsed.grid ? { ...parsed.grid, background: '#f8fafd' } : get().grid,
        activeScenario: parsed.activeScenario ?? 'custom',
        runtime: EMPTY_RUNTIME(),
        selectedComponentIds: [],
        selectedWireId: null,
        viewOrientationEditor: null,
        history: [],
        future: [],
        dirty: footprintUpgraded || componentMetadataUpgraded || alignedWires.some((wire, i) => wire !== loadedWires[i]),
      })
      get().pushEvent('info', 'Projeto carregado de arquivo JSON.')
      get().step()
    } catch (e) {
      get().pushEvent('error', 'Falha ao carregar o JSON: arquivo inválido.')
      console.error(e)
    }
  },

  newProject: () => {
    setStoredCover(null)
    get().stop()
    set({
      components: [],
      wires: [],
      showEmptyWelcome: true,
      ladder: { rungs: [] },
      fcBlocks: { fc1: [], fc2: [] },
      activePlcId: null,
      plcPrograms: {},
      plcTags: {},
      projectFiles: {},
      hiddenProjectFolders: {},
      grafcet: emptyGrafcet(),
      grafcetRuntime: emptyGrafcetRuntime(),
      tags: [],
      activeScenario: 'custom',
      runtime: EMPTY_RUNTIME(),
      selectedComponentIds: [],
      selectedWireId: null,
      viewOrientationEditor: null,
      history: [],
      future: [],
      dirty: false,
      currentProjectName: null,
    })
    get().pushEvent('info', 'Novo projeto em branco criado.')
  },

  // ----------------------------------------------------- projetos (navegador)
  setCurrentProjectName: (name) => set({ currentProjectName: name }),

  saveProjectAs: (name) => {
    const trimmed = name.trim()
    if (!trimmed) return false
    const json = get().saveJSON()
    const ok = saveProject(trimmed, json)
    if (ok) {
      setLastOpened(trimmed)
      set({ currentProjectName: trimmed, dirty: false })
      get().pushEvent('info', `Projeto "${trimmed}" guardado neste navegador.`)
    } else {
      get().pushEvent('error', 'Não foi possível guardar: armazenamento do navegador indisponível ou cheio.')
    }
    return ok
  },

  loadProjectByName: (name) => {
    const json = loadProject(name)
    if (!json) {
      get().pushEvent('error', `Projeto "${name}" não encontrado neste navegador.`)
      return false
    }
    get().loadJSON(json)
    setLastOpened(name)
    set({ currentProjectName: name })
    get().pushEvent('info', `Projeto "${name}" reaberto.`)
    return true
  },

  deleteProjectByName: (name) => {
    deleteProject(name)
    if (get().currentProjectName === name) set({ currentProjectName: null })
    get().pushEvent('info', `Projeto "${name}" eliminado deste navegador.`)
  },

  // ------------------------------------------------------- copiar / colar
  copySelection: () => {
    const { components, wires, selectedComponentIds } = get()
    if (!selectedComponentIds.length) return
    const selSet = new Set(selectedComponentIds)
    const comps = components.filter((c) => selSet.has(c.id))
    if (!comps.length) return
    const terminalIds = new Set(comps.flatMap((c) => c.terminals.map((t) => t.id)))
    const relevantWires = wires.filter((w) => terminalIds.has(w.fromTerminalId) && terminalIds.has(w.toTerminalId))
    set({
      clipboard: {
        components: JSON.parse(JSON.stringify(comps)),
        wires: JSON.parse(JSON.stringify(relevantWires)),
        ladder: [],
      },
    })
    get().pushEvent('info', `${comps.length} componente(s) copiado(s)${relevantWires.length ? ` (+ ${relevantWires.length} cabo(s) internos)` : ''}.`)
  },

  pasteClipboard: () => {
    const clip = get().clipboard
    if (!clip || !clip.components.length) return
    get().commitHistory()

    const terminalMap = new Map<string, string>()
    const newComponents: ElectricalComponent[] = []
    for (const src of clip.components) {
      const newId = nanoid(8)
      const newTerminals: Terminal[] = src.terminals.map((t) => {
        const newTid = nanoid(8)
        terminalMap.set(t.id, newTid)
        return { ...t, id: newTid, componentId: newId, energized: false }
      })
      const clone: ElectricalComponent = {
        ...JSON.parse(JSON.stringify(src)),
        id: newId,
        schematicX: src.schematicX + 40,
        schematicY: src.schematicY + 40,
        panel3DPosition: src.panel3DPosition
          ? { x: src.panel3DPosition.x + 0.35, y: src.panel3DPosition.y, z: src.panel3DPosition.z + 0.18 }
          : undefined,
        terminals: newTerminals,
        ref: nextRef([...get().components, ...newComponents], src.type),
        z: nextTopZ([...get().components, ...newComponents], get().wires),
      }
      const free = nearestFreeComponentPosition(clone, clone.schematicX, clone.schematicY, [...get().components, ...newComponents])
      clone.schematicX = free.x
      clone.schematicY = free.y
      newComponents.push(clone)
    }
    const newWires: Wire[] = clip.wires
      .filter((w) => terminalMap.has(w.fromTerminalId) && terminalMap.has(w.toTerminalId))
      .map((w) => ({
        ...JSON.parse(JSON.stringify(w)),
        id: nanoid(8),
        fromTerminalId: terminalMap.get(w.fromTerminalId)!,
        toTerminalId: terminalMap.get(w.toTerminalId)!,
        energized: false,
      }))

    set((s) => ({
      components: [...s.components, ...newComponents],
      wires: [...s.wires, ...newWires],
      selectedComponentIds: newComponents.map((c) => c.id),
      selectedWireId: null,
      dirty: true,
    }))
    get().pushEvent('info', `Colado(s) ${newComponents.length} componente(s)${newWires.length ? ` e ${newWires.length} cabo(s)` : ''}.`)
    get().step()
  },
}))

function pushRuntime(set: (partial: Partial<Store>) => void, st: Store) {
  set({
    components: [...st.components],
    wires: [...st.wires],
    runtime: { ...st.runtime },
    grafcetRuntime: { ...st.grafcetRuntime },
    sim: { ...st.sim },
  })
}

/** Deriva a tabela usada pelos monitores a partir do último scan. */
export function deriveTable(): AddressTable {
  return useSimStore.getState().runtime.table
}

export { nextAddress }
