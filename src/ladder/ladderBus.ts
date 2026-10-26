import { create } from 'zustand'

/** Ponte leve entre a barra global e o editor Ladder que está montado. */
export type LadderBusAction = 'openVariables' | 'compile' | 'addNetwork' | 'addBlock'
/** Estado do botão «Compilar» da barra (espelhado do editor). */
export type LadderCompileState = 'none' | 'ok' | 'warning' | 'error' | 'stale'

interface LadderUiState {
  compileState: LadderCompileState
  compileLabel: string
  setCompileState: (state: LadderCompileState, label: string) => void
  emit: (action: LadderBusAction) => void
  onAction?: (action: LadderBusAction) => void
  setActionHandler: (handler: ((action: LadderBusAction) => void) | undefined) => void
}

export const useLadderUi = create<LadderUiState>((set, get) => ({
  compileState: 'none',
  compileLabel: '',
  setCompileState: (compileState, compileLabel) => { if (get().compileState !== compileState || get().compileLabel !== compileLabel) set({ compileState, compileLabel }) },
  emit: (action) => get().onAction?.(action),
  setActionHandler: (onAction) => set({ onAction }),
}))
