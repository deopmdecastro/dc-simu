/** Gesto didático do RESET azul: rodar para a direita ou para a esquerda (arrasto), sem alterar o modo M/A. */
export const THERMAL_RESET_DRAG_PX = 28
export const THERMAL_RESET_MAX_DEG = 35
export const THERMAL_RESET_THRESHOLD = 0.6

export function thermalResetTurn(deltaX: number): number {
  return Number.isFinite(deltaX) ? Math.max(-1, Math.min(1, deltaX / THERMAL_RESET_DRAG_PX)) : 0
}

export function thermalResetAccepted(turn: number): boolean {
  return Number.isFinite(turn) && Math.abs(turn) >= THERMAL_RESET_THRESHOLD
}

export type ThermalResetDirection = 'left' | 'right'

/** Sentido do gesto: arrastar à direita roda para a direita (+), à esquerda roda para a esquerda (−). */
export function thermalResetDirection(turn: number): ThermalResetDirection | null {
  if (!thermalResetAccepted(turn)) return null
  return turn > 0 ? 'right' : 'left'
}

/**
 * Os botões do inspetor (teclado/toque) pedem ao 3D que rode o botão azul no mesmo sentido do arrasto,
 * para que as duas formas de rearmar mostrem o mesmo movimento. A lógica elétrica continua em `actuateImported`.
 */
export const THERMAL_RESET_TURN_EVENT = 'dc:thermal-reset-turn'
export const THERMAL_RESET_TURN_MS = 260

export function requestThermalResetTurn(componentId: string, direction: ThermalResetDirection): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(THERMAL_RESET_TURN_EVENT, { detail: { id: componentId, direction } }))
}
