import type { ElectricalComponent } from '../types'

/** Valores reais do PLC para os modelos de texto do LCD editável. */
export function logoRuntimeVars(component: ElectricalComponent, runState: string, diagnostics: Array<{ level: string }>, now = new Date()) {
  const bit = (on: unknown) => on ? '1' : '0'
  const inputs = Array.from({ length: 8 }, (_, index) => bit(component.terminals.find((terminal) => terminal.label === `I0.${index}`)?.energized)).join('')
  const outputs = Array.from({ length: 4 }, (_, index) => bit(component.state.outputs?.[`Q0.${index}`])).join('')
  return {
    logoPowered: !!component.state.powered,
    logoMode: runState === 'running' ? 'RUN' : runState === 'paused' ? 'PAUSE' : 'STOP',
    logoInputs: inputs, logoOutputs: outputs,
    logoTime: now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
    logoDate: now.toLocaleDateString('pt-PT'),
    logoErrors: diagnostics.filter((item) => item.level === 'error').length,
    logoWarnings: diagnostics.filter((item) => item.level === 'warning').length,
  }
}
