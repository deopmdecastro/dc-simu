/** O estado elétrico pode permanecer calculado quando a simulação está parada,
 * mas o efeito visual de fluxo só existe durante RUN em fios que conduzem corrente. */
export function wireEnergyEffectVisible(
  runState: 'running' | 'paused' | 'stopped',
  energized: boolean,
  carryingCurrent?: boolean,
) {
  return runState === 'running' && (carryingCurrent !== undefined ? carryingCurrent : energized)
}

/**
 * Fluxo visual em tubos de ar (pneumático) e água (hidráulico).
 * Ativo em RUN quando há pressão nominal ou, em falta de pressão, quando o tubo está «energizado»
 * (ligado a uma fonte ativa no modelo de simulação).
 */
export function wireFluidEffectVisible(
  runState: 'running' | 'paused' | 'stopped',
  kind: string | undefined,
  opts?: { pneumaticPressureBar?: number; hydraulicPressureBar?: number; energized?: boolean },
) {
  if (runState !== 'running') return false
  if (kind === 'pneumatic') {
    const p = opts?.pneumaticPressureBar
    if (typeof p === 'number') return p > 0.05
    return !!opts?.energized
  }
  if (kind === 'hydraulic') {
    const p = opts?.hydraulicPressureBar
    if (typeof p === 'number') return p > 0.05
    return !!opts?.energized
  }
  return false
}

/** Abaixo deste ângulo (graus) o piso é visto de perfil e degenera numa faixa de linhas. */
export const FLOOR_GRID_MIN_PITCH = 10

/** A grelha de piso só acrescenta profundidade quando a câmara a vê de cima ou de baixo. */
export function floorGridVisible(pitchDeg: number): boolean {
  return Number.isFinite(pitchDeg) && Math.abs(pitchDeg) >= FLOOR_GRID_MIN_PITCH
}
