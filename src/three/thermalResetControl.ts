/** Animação opcional do botão RESET (ângulo visual).
 *  O rearme em si é por clique — ver ImportedCadDevice em Panel3D. */
export const THERMAL_RESET_DRAG_PX = 28
export const THERMAL_RESET_MAX_DEG = 35
export const THERMAL_RESET_THRESHOLD = 0.6

export function thermalResetTurn(deltaX: number): number {
  return Number.isFinite(deltaX) ? Math.max(-1, Math.min(1, deltaX / THERMAL_RESET_DRAG_PX)) : 0
}

export function thermalResetAccepted(turn: number): boolean {
  return Number.isFinite(turn) && Math.abs(turn) >= THERMAL_RESET_THRESHOLD
}
