/** O estado elétrico pode permanecer calculado quando a simulação está parada,
 * mas o efeito visual de fluxo só existe durante RUN. */
export function wireEnergyEffectVisible(
  runState: 'running' | 'paused' | 'stopped',
  energized: boolean,
) {
  return runState === 'running' && energized
}
