/**
 * Vista em dois canvas: dois ambientes do projeto (ou duas páginas GRAFCET)
 * lado a lado. Só faz sentido quando o projeto tem mais de um ambiente/página.
 */
import { create } from 'zustand'
import type { ViewMode } from '../components/Toolbar'

export type SplitPaneKind = ViewMode

export interface SplitPane {
  /** Ambiente (3D, Ladder, GRAFCET, IEC, Monitor). */
  mode: SplitPaneKind
  /** Página GRAFCET (chart id) quando mode === 'grafcet' e há várias páginas. */
  chartId?: string
}

interface SplitViewState {
  /** Vista dividida ativa. */
  enabled: boolean
  /** Orientação: lado a lado ou empilhado. */
  orientation: 'horizontal' | 'vertical'
  left: SplitPane
  right: SplitPane
  /** Diálogo de escolha aberto. */
  dialogOpen: boolean
  openDialog: () => void
  closeDialog: () => void
  apply: (left: SplitPane, right: SplitPane, orientation?: 'horizontal' | 'vertical') => void
  disable: () => void
  setOrientation: (o: 'horizontal' | 'vertical') => void
}

const DEFAULT_LEFT: SplitPane = { mode: 'grafcet' }
const DEFAULT_RIGHT: SplitPane = { mode: 'commands' }

export const useSplitView = create<SplitViewState>((set) => ({
  enabled: false,
  orientation: 'horizontal',
  left: DEFAULT_LEFT,
  right: DEFAULT_RIGHT,
  dialogOpen: false,
  openDialog: () => set({ dialogOpen: true }),
  closeDialog: () => set({ dialogOpen: false }),
  apply: (left, right, orientation) =>
    set((s) => ({
      enabled: true,
      left,
      right,
      orientation: orientation ?? s.orientation,
      dialogOpen: false,
    })),
  disable: () => set({ enabled: false, dialogOpen: false }),
  setOrientation: (orientation) => set({ orientation }),
}))
