import { create } from 'zustand'

/** Ponte leve entre a barra global e o editor Ladder que está montado. */
export type LadderBusAction = 'openVariables'

interface LadderUiState {
  emit: (action: LadderBusAction) => void
  onAction?: (action: LadderBusAction) => void
  setActionHandler: (handler: ((action: LadderBusAction) => void) | undefined) => void
}

export const useLadderUi = create<LadderUiState>((set, get) => ({
  emit: (action) => get().onAction?.(action),
  setActionHandler: (onAction) => set({ onAction }),
}))
