import { create } from 'zustand'

export type GrafcetCanvasTool = 'select' | 'pan'

export type GrafcetBusAction =
  | 'addConnectedStep'
  | 'addStep'
  | 'addTransition'
  | 'addAction'
  | 'addFork'
  | 'addJoin'
  | 'openTemplates'
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
  | 'setToolSelect'
  | 'setToolPan'

interface GrafcetUiState {
  zoom: number
  selectedStepId: string | null
  tool: GrafcetCanvasTool
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
  setTool: (tool) => set({ tool }),
  setZoom: (zoom) => set({ zoom }),
  setSelectedStepId: (selectedStepId) => set({ selectedStepId }),
  emit: (action) => {
    const handler = get().onAction
    if (handler) handler(action)
  },
  setActionHandler: (onAction) => set({ onAction }),
}))
