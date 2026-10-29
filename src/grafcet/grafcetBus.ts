import { create } from 'zustand'
import { isDemoMode } from '../store/demoMode'

export type GrafcetCanvasTool = 'select' | 'pan' | 'connect'

const readFlag = (key: string, fallback: boolean) => {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v !== '0'
  } catch {
    return fallback
  }
}
const writeFlag = (key: string, value: boolean) => {
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    /* navegação privada */
  }
}

export type GrafcetBusAction =
  | 'addNote'
  | 'addText'
  | 'addConnectedStep'
  | 'addStep'
  | 'addTransition'
  | 'addAction'
  | 'addFork'
  | 'addJoin'
  | 'openTemplates'
  | 'openSignals'
  | 'togglePalette'
  | 'generateLadder'
  | 'exportSvg'
  | 'exportJson'
  | 'importJson'
  | 'restart'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset'
  | 'openShortcuts'
  | 'openDiagnostics'
  | 'autoLayout'
  | 'toggleMinimap'
  | 'fitView'
  | 'setToolSelect'
  | 'setToolPan'
  | 'setToolConnect'

interface GrafcetUiState {
  zoom: number
  selectedStepId: string | null
  tool: GrafcetCanvasTool
  /** Mostrar grelha de pontos alinhada com o encaixe. */
  gridOn: boolean
  /** Encaixar etapas à grelha ao arrastar (Alt desativa temporariamente). */
  snapOn: boolean
  /** Painel «Componentes» aberto (espelhado do editor, para o botão da barra). */
  paletteOpen: boolean
  setPaletteOpen: (open: boolean) => void
  /** Minimapa visível (espelhado do editor, para o botão «Mapa» da barra). */
  minimapOn: boolean
  setMinimapOn: (on: boolean) => void
  /** Resumo do diagrama mostrado na barra (etapas, transições e ações). */
  stats: string
  setStats: (text: string) => void
  /** Mostrar controlos e painel de simulação no GRAFCET. */
  simVisible: boolean
  toggleSim: () => void
  /** Estado do Ladder gerado face ao GRAFCET (para o botão Gerar/Atualizar). */
  ladderSync: 'none' | 'synced' | 'stale' | 'blocked'
  setLadderSync: (status: 'none' | 'synced' | 'stale' | 'blocked') => void
  /** Atualiza o Ladder automaticamente quando o GRAFCET muda (só depois de gerado). */
  autoSync: boolean
  toggleAutoSync: () => void
  toggleGrid: () => void
  toggleSnap: () => void
  setTool: (tool: GrafcetCanvasTool) => void
  setZoom: (z: number) => void
  setSelectedStepId: (id: string | null) => void
  emit: (action: GrafcetBusAction) => void
  onAction?: (action: GrafcetBusAction) => void
  setActionHandler: (handler: ((action: GrafcetBusAction) => void) | undefined) => void
}

export const useGrafcetUi = create<GrafcetUiState>((set, get) => ({
  zoom: 1,
  selectedStepId: null,
  tool: 'select',
  gridOn: readFlag('dcsimu:grafcet:grid', true),
  snapOn: readFlag('dcsimu:grafcet:snap', true),
  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  // O minimapa aparece só a pedido: é um cartão sobre o desenho (DC-ADR-059).
  minimapOn: readFlag('dcsimu:grafcet:minimap', false),
  setMinimapOn: (minimapOn) => { writeFlag('dcsimu:grafcet:minimap', minimapOn); set({ minimapOn }) },
  stats: '',
  setStats: (stats) => { if (get().stats !== stats) set({ stats }) },
  // Painel de simulação (fundo do GRAFCET): aberto no computador, recolhido no telemóvel (só a barra).
  simVisible: readFlag('dcsimu:grafcet:simvisible', (() => { try { return !window.matchMedia('(max-width: 800px)').matches } catch { return true } })()),
  toggleSim: () =>
    set((state) => {
      writeFlag('dcsimu:grafcet:simvisible', !state.simVisible)
      return { simVisible: !state.simVisible }
    }),
  ladderSync: 'none',
  setLadderSync: (ladderSync) => { if (get().ladderSync !== ladderSync) set({ ladderSync }) },
  autoSync: readFlag('dcsimu:grafcet:autosync', true),
  toggleAutoSync: () =>
    set((state) => {
      writeFlag('dcsimu:grafcet:autosync', !state.autoSync)
      return { autoSync: !state.autoSync }
    }),
  toggleGrid: () =>
    set((state) => {
      writeFlag('dcsimu:grafcet:grid', !state.gridOn)
      return { gridOn: !state.gridOn }
    }),
  toggleSnap: () =>
    set((state) => {
      writeFlag('dcsimu:grafcet:snap', !state.snapOn)
      return { snapOn: !state.snapOn }
    }),
  setTool: (tool) => {
    // Em modo demonstração (landing), «Ligar» permanece escondido e sem efeito.
    if (isDemoMode() && tool === 'connect') return
    set({ tool })
  },
  setZoom: (zoom) => set({ zoom }),
  setSelectedStepId: (selectedStepId) => set({ selectedStepId }),
  emit: (action) => {
    const handler = get().onAction
    if (handler) handler(action)
  },
  setActionHandler: (onAction) => set({ onAction }),
}))
