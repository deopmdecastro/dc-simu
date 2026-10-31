// Estado partilhado do simulador de comandos: canvas, biblioteca/inspetor (esquerda),
// Entradas/Saídas e Objetos (direita) e barra de ferramentas leem e mudam o mesmo estado.
import { create } from 'zustand'
import { useSimStore } from '../store/useSimStore'
import { emptyCmdRuntime, stepCommands, type CmdRuntime } from './engine'
import type { CmdKind } from './model'

export type CmdTool = 'select' | 'wire' | 'erase' | 'pan'
export type CmdSelection = { type: 'part' | 'wire'; id: string } | null
export type CmdUiEvent = 'fit' | 'zoomIn' | 'zoomOut' | 'zoomReset' | 'examples' | 'clear' | 'rotate' | 'delete' | 'focusSelection'

interface CommandsUi {
  tool: CmdTool
  setTool: (tool: CmdTool) => void
  gridOn: boolean
  toggleGrid: () => void
  /** Escala da vista (o canvas atualiza; a barra mostra e pede zoom por evento). */
  zoom: number
  setZoom: (zoom: number) => void
  selection: CmdSelection
  /** Origem da seleção: no canvas abre o Inspetor; ao colocar da Biblioteca fica na Biblioteca. */
  selectedFrom: 'canvas' | 'library'
  select: (selection: CmdSelection, from?: 'canvas' | 'library') => void
  placing: CmdKind | null
  setPlacing: (kind: CmdKind | null) => void
  rt: CmdRuntime
  /** Pausa: o tempo simulado para, mas o estado elétrico mantém-se. */
  paused: boolean
  start: () => void
  stop: () => void
  pause: () => void
  tick: (dtMs: number) => void
  patchRt: (patch: Partial<CmdRuntime>) => void
  press: (tag: string, down: boolean) => void
  toggle: (tag: string) => void
  trip: (tag: string, value: boolean) => void
  /** Pedido para o canvas (ajustar, zoom, exemplos…): `n` muda a cada pedido. */
  event: { name: CmdUiEvent; n: number } | null
  emit: (name: CmdUiEvent) => void
}

const diagram = () => useSimStore.getState().commands

export const useCommandsUi = create<CommandsUi>((set, get) => ({
  tool: 'select',
  setTool: (tool) => set({ tool, placing: null }),
  gridOn: true,
  toggleGrid: () => set({ gridOn: !get().gridOn }),
  zoom: 1,
  setZoom: (zoom) => set({ zoom }),
  selection: null,
  selectedFrom: 'canvas',
  select: (selection, from = 'canvas') => set({ selection, selectedFrom: from }),
  placing: null,
  setPlacing: (placing) => set({ placing, tool: 'select' }),
  rt: emptyCmdRuntime(),
  paused: false,
  start: () => {
    const { rt, paused } = get()
    if (rt.running && paused) { set({ paused: false }); return }
    set({ selection: null, placing: null, paused: false, rt: stepCommands(diagram(), { ...emptyCmdRuntime(), running: true }, 0) })
  },
  stop: () => set({ rt: emptyCmdRuntime(), paused: false }),
  pause: () => { if (get().rt.running) set({ paused: true }) },
  tick: (dtMs) => { const { rt, paused } = get(); if (rt.running && !paused) set({ rt: stepCommands(diagram(), rt, dtMs) }) },
  patchRt: (patch) => set({ rt: stepCommands(diagram(), { ...get().rt, ...patch }, 0) }),
  press: (tag, down) => get().patchRt({ pressed: { ...get().rt.pressed, [tag]: down } }),
  toggle: (tag) => get().patchRt({ toggled: { ...get().rt.toggled, [tag]: !get().rt.toggled[tag] } }),
  trip: (tag, value) => get().patchRt({ tripped: { ...get().rt.tripped, [tag]: value } }),
  event: null,
  emit: (name) => set({ event: { name, n: (get().event?.n ?? 0) + 1 } }),
}))

/** Símbolos que se operam com o rato durante a simulação. */
export const MOMENTARY: CmdKind[] = ['pushNO', 'pushNC', 'limitNO']
export const TOGGLES: CmdKind[] = ['emergency', 'selector', 'breaker3', 'disconnector3']
