// Estado partilhado do simulador de comandos: canvas, biblioteca/inspetor (esquerda),
// Entradas/Saídas e Objetos (direita) e barra de ferramentas leem e mudam o mesmo estado.
import { create } from 'zustand'
import { useSimStore } from '../store/useSimStore'
import { emptyCmdRuntime, stepCommands, type CmdRuntime } from './engine'
import type { CmdKind } from './model'
import { DEFAULT_PAGE_ID } from './pages'
import type { RightDockTab } from '../components/RightDockTabs'

export type CmdTool = 'select' | 'wire' | 'erase' | 'pan'
export type CmdSelection = { type: 'part' | 'wire' | 'text'; id: string } | null
/** IDs de símbolos selecionados (multi-seleção no canvas). O `selection` principal alimenta o inspetor. */
export type CmdUiEvent = 'fit' | 'zoomIn' | 'zoomOut' | 'zoomReset' | 'examples' | 'import' | 'clear' | 'rotate' | 'delete' | 'focusSelection' | 'pageLink'

interface CommandsUi {
  tool: CmdTool
  setTool: (tool: CmdTool) => void
  gridOn: boolean
  toggleGrid: () => void
  /** Escala da vista (o canvas atualiza; a barra mostra e pede zoom por evento). */
  zoom: number
  setZoom: (zoom: number) => void
  /** Painel inferior de Entradas/Saídas (telemóvel), aberto ou recolhido à barra. */
  dockOpen: boolean
  toggleDock: () => void
  /** Separador ativo do painel lateral completo no painel inferior (telemóvel). */
  dockTab: RightDockTab
  setDockTab: (tab: RightDockTab) => void
  selection: CmdSelection
  /** Todos os símbolos selecionados (marquee / Shift·Ctrl). */
  selectedPartIds: string[]
  /** Origem da seleção: no canvas abre o Inspetor; ao colocar da Biblioteca fica na Biblioteca. */
  selectedFrom: 'canvas' | 'library'
  select: (selection: CmdSelection, from?: 'canvas' | 'library') => void
  /** Substitui ou junta a multi-seleção de símbolos; define `selection` no primeiro id. */
  selectParts: (ids: string[], additive?: boolean, from?: 'canvas' | 'library') => void
  /** Textos livres (ferramenta Texto) selecionados em grupo (marquee / Ctrl+A). */
  selectedTextIds: string[]
  /** Títulos do esquema (texts do diagrama, ex.: «Circuito de potência») selecionados em grupo. */
  selectedLabelIds: string[]
  /** Seleção de grupo: símbolos + textos + títulos (marquee, Ctrl+A). */
  selectGroup: (parts: string[], texts: string[], labels: string[], additive?: boolean) => void
  placing: CmdKind | null
  setPlacing: (kind: CmdKind | null) => void
  rt: CmdRuntime
  /** Pausa: o tempo simulado para, mas o estado elétrico mantém-se. */
  paused: boolean
  start: () => void
  stop: () => void
  pause: () => void
  /** Avança a simulação; `force` avança mesmo em pausa (botão «passo»). */
  tick: (dtMs: number, force?: boolean) => void
  patchRt: (patch: Partial<CmdRuntime>) => void
  press: (tag: string, down: boolean) => void
  toggle: (tag: string) => void
  trip: (tag: string, value: boolean) => void
  /** Pedido para o canvas (ajustar, zoom, exemplos…): `n` muda a cada pedido. */
  event: { name: CmdUiEvent; n: number } | null
  emit: (name: CmdUiEvent) => void
  /** Duplo clique na Biblioteca: o canvas insere o símbolo no centro da vista. */
  quickAdd: { kind: CmdKind; n: number } | null
  requestQuickAdd: (kind: CmdKind) => void
  /** Símbolos colocados recentemente (o último primeiro), guardados neste navegador. */
  recent: CmdKind[]
  markRecent: (kind: CmdKind) => void
  /** Página ativa do esquema (folha). */
  activePageId: string
  setActivePageId: (id: string) => void
}

const RECENT_KEY = 'dcsimu:commands:library:recent'
const readRecent = (): CmdKind[] => {
  try { return (JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as CmdKind[]).slice(0, 8) } catch { return [] }
}

const diagram = () => useSimStore.getState().commands

// —— Ligação ao simulador do PLC ——————————————————————————————————————————————
// Um esquema com entradas/saídas do PLC (plcIn/plcOut) corre com o programa do PLC: as saídas
// Q seguem a tabela do simulador do PLC e as entradas I com tensão vão para o simulador de
// sinais do PLC (ou para as entradas virtuais, num projeto sem PLC).
const PLC_INPUT = /^[IE]\d+(\.\d+)?$/i
/** Entradas escritas pelo esquema (com o valor anterior, a repor ao parar) e se fomos nós a arrancar o PLC. */
const plcLink = { written: new Map<string, { plcId: string | null; address: string; previous: boolean | undefined }>(), startedPlc: false }
const linkedToPlc = () => diagram().parts.some((p) => (p.kind === 'plcIn' || p.kind === 'plcOut') && !!p.tag)
function plcOutputs(): Record<string, boolean> | undefined {
  if (!linkedToPlc()) return undefined
  const table = useSimStore.getState().runtime.table as Record<string, unknown>
  const out: Record<string, boolean> = {}
  for (const p of diagram().parts) if (p.kind === 'plcOut' && p.tag) out[p.tag] = !!table[p.tag]
  return out
}
/** PLC do esquema com o borne `address` (o ativo primeiro); sem PLC, usam-se as entradas virtuais. */
function plcFor(address: string) {
  const sim = useSimStore.getState()
  const plcs = sim.components.filter((c) => /plc/i.test(c.type) && c.terminals.some((t) => t.label === address))
  return plcs.find((c) => c.id === sim.activePlcId) ?? plcs[0] ?? null
}
function pushPlcInputs(rt: CmdRuntime) {
  for (const [address, on] of Object.entries(rt.plcInputs ?? {})) {
    if (!PLC_INPUT.test(address)) continue
    const sim = useSimStore.getState()
    const plc = plcFor(address)
    const key = (plc?.id ?? '') + ':' + address
    const current = plc ? (plc.state.simInputs as Record<string, boolean> | undefined)?.[address] : sim.virtualInputs[address]
    if (!plcLink.written.has(key)) plcLink.written.set(key, { plcId: plc?.id ?? null, address, previous: current })
    if (current === on) continue
    // Com PLC: o simulador de sinais do próprio PLC (NA soma ao cabo; NF fica em série com ele).
    if (plc) sim.setPlcSimInput(plc.id, address, on)
    else sim.setVirtualInput(address, on)
  }
}
/** Passo do esquema com as saídas atuais do PLC; as entradas resultantes seguem para o PLC. */
function stepLinked(rt: CmdRuntime, dtMs: number): CmdRuntime {
  const next = stepCommands(diagram(), { ...rt, plc: plcOutputs() }, dtMs)
  if (next.running) pushPlcInputs(next)
  return next
}
function unlinkPlc() {
  if (plcLink.written.size) {
    const written = [...plcLink.written.values()]
    plcLink.written = new Map()
    useSimStore.setState((s) => ({
      virtualInputs: Object.fromEntries(Object.entries(s.virtualInputs).filter(([address]) => !written.some((w) => !w.plcId && w.address === address))),
      components: s.components.map((c) => {
        const mine = written.filter((w) => w.plcId === c.id)
        if (!mine.length) return c
        const inputs = { ...(c.state.simInputs as Record<string, boolean> | undefined) }
        for (const w of mine) { if (w.previous === undefined) delete inputs[w.address]; else inputs[w.address] = w.previous }
        return { ...c, state: { ...c.state, simInputs: inputs } }
      }),
    }))
  }
  if (plcLink.startedPlc) { plcLink.startedPlc = false; useSimStore.getState().stop() }
}

export const useCommandsUi = create<CommandsUi>((set, get) => ({
  tool: 'select',
  setTool: (tool) => set({ tool, placing: null }),
  gridOn: true,
  toggleGrid: () => set({ gridOn: !get().gridOn }),
  zoom: 1,
  setZoom: (zoom) => set({ zoom }),
  dockOpen: false,
  toggleDock: () => set((state) => ({ dockOpen: !state.dockOpen })),
  dockTab: 'signals',
  setDockTab: (dockTab) => set({ dockTab }),
  selection: null,
  selectedPartIds: [],
  selectedFrom: 'canvas',
  select: (selection, from = 'canvas') => set({
    selection,
    selectedFrom: from,
    selectedPartIds: selection?.type === 'part' ? [selection.id] : [],
    selectedTextIds: [],
    selectedLabelIds: [],
  }),
  selectedTextIds: [],
  selectedLabelIds: [],
  selectGroup: (parts, texts, labels, additive = false) => set((state) => {
    const merge = (current: string[], ids: string[]) => {
      if (!additive) return [...new Set(ids)]
      const next = new Set(current)
      for (const id of ids) { if (next.has(id)) next.delete(id); else next.add(id) }
      return [...next]
    }
    const partIds = merge(state.selectedPartIds, parts)
    return {
      selectedPartIds: partIds,
      selectedTextIds: merge(state.selectedTextIds, texts),
      selectedLabelIds: merge(state.selectedLabelIds, labels),
      selection: partIds.length ? { type: 'part' as const, id: partIds[partIds.length - 1] } : null,
      selectedFrom: 'canvas' as const,
    }
  }),
  selectParts: (ids, additive = false, from = 'canvas') => set((state) => {
    const unique = [...new Set(ids.filter(Boolean))]
    let next = unique
    if (additive) {
      const setIds = new Set(state.selectedPartIds)
      for (const id of unique) {
        if (setIds.has(id)) setIds.delete(id)
        else setIds.add(id)
      }
      next = [...setIds]
    }
    return {
      selectedPartIds: next,
      selection: next.length ? { type: 'part' as const, id: next[next.length - 1] } : null,
      selectedFrom: from,
      ...(additive ? {} : { selectedTextIds: [], selectedLabelIds: [] }),
    }
  }),
  placing: null,
  setPlacing: (placing) => set({ placing, tool: 'select' }),
  rt: emptyCmdRuntime(),
  paused: false,
  start: () => {
    const { rt, paused } = get()
    if (rt.running && paused) { set({ paused: false }); return }
    // Com entradas/saídas do PLC no esquema, o programa do PLC corre ao mesmo tempo.
    if (linkedToPlc() && useSimStore.getState().sim.runState !== 'running') { useSimStore.getState().play(); plcLink.startedPlc = true }
    set({ selection: null, selectedPartIds: [], placing: null, paused: false, rt: stepLinked({ ...emptyCmdRuntime(), running: true }, 0) })
  },
  stop: () => { unlinkPlc(); set({ rt: emptyCmdRuntime(), paused: false }) },
  pause: () => { if (get().rt.running) set({ paused: true }) },
  tick: (dtMs, force) => { const { rt, paused } = get(); if (rt.running && (!paused || force)) set({ rt: stepLinked(rt, dtMs) }) },
  patchRt: (patch) => set({ rt: stepLinked({ ...get().rt, ...patch }, 0) }),
  press: (tag, down) => get().patchRt({ pressed: { ...get().rt.pressed, [tag]: down } }),
  toggle: (tag) => get().patchRt({ toggled: { ...get().rt.toggled, [tag]: !get().rt.toggled[tag] } }),
  trip: (tag, value) => get().patchRt({ tripped: { ...get().rt.tripped, [tag]: value } }),
  event: null,
  emit: (name) => set({ event: { name, n: (get().event?.n ?? 0) + 1 } }),
  quickAdd: null,
  requestQuickAdd: (kind) => set({ placing: null, quickAdd: { kind, n: (get().quickAdd?.n ?? 0) + 1 } }),
  recent: typeof localStorage === 'undefined' ? [] : readRecent(),
  markRecent: (kind) => {
    const next = [kind, ...get().recent.filter((k) => k !== kind)].slice(0, 8)
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* armazenamento indisponível */ }
    set({ recent: next })
  },
  activePageId: DEFAULT_PAGE_ID,
  setActivePageId: (id) => set({ activePageId: id, selection: null, selectedPartIds: [], selectedTextIds: [], selectedLabelIds: [] }),
}))

/** Símbolos que se operam com o rato durante a simulação. */
export const MOMENTARY: CmdKind[] = ['pushNO', 'pushNC', 'pushIllum', 'limitNO', 'limitNC', 'proximity', 'pressureSwitch', 'sensor3wNO', 'sensor3wNC', 'levelNO', 'levelNC', 'footNO', 'footNC']
export const TOGGLES: CmdKind[] = ['emergency', 'pullCord', 'selector', 'breaker1', 'breaker2', 'breakerTM1', 'breaker3', 'motorBreaker3', 'disconnector1', 'disconnector2', 'disconnector3', 'switchDisconnector1', 'switchDisconnector3', 'fuseDisconnector3', 'fuseSwitchDisconnector3', 'mainSwitch', 'fuseDisconnector', 'rcd', 'valve32', 'valve52', 'valve22', 'valve42', 'valve53c', 'valve53p', 'valve53e', 'plcOut']
