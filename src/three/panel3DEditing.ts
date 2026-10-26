/** O estado elétrico pode permanecer calculado quando a simulação está parada,
 * mas o efeito visual de fluxo só existe durante RUN. */
export function wireEnergyEffectVisible(
  runState: 'running' | 'paused' | 'stopped',
  energized: boolean,
) {
  return runState === 'running' && energized
}

/** Abaixo deste ângulo (graus) o piso é visto de perfil e degenera numa faixa de linhas. */
export const FLOOR_GRID_MIN_PITCH = 10

/** A grelha de piso só acrescenta profundidade quando a câmara a vê de cima ou de baixo. */
export function floorGridVisible(pitchDeg: number): boolean {
  return Number.isFinite(pitchDeg) && Math.abs(pitchDeg) >= FLOOR_GRID_MIN_PITCH
}
