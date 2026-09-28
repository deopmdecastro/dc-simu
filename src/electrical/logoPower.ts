import type { ElectricalComponent, Wire } from '../types'
import { computeContinuity, sourceTerminalIds } from './engine'

/** Aproximação binária da alimentação DC L+/M; não simula tensão analógica. */
export function logoElectricalInputs(plc: ElectricalComponent, components: ElectricalComponent[], wires: Wire[]) {
  const positiveRoots = sourceTerminalIds(components).filter((id) => {
    const term = components.flatMap((c) => c.terminals).find((t) => t.id === id)
    return term?.kind !== 'neutral' && term?.kind !== 'earth'
  })
  const negativeRoots = components.flatMap((c) => {
    if (c.type === 'powerSupply' && c.state.on) return c.terminals.filter((t) => t.label === '-V').map((t) => t.id)
    if (c.type === 'powerSupplyProauto24B' && c.state.powered) return c.terminals.filter((t) => t.label === '-V1' || t.label === '-V2').map((t) => t.id)
    if (c.type === 'busbarNeutral' && c.state.source !== false) return c.terminals.map((t) => t.id)
    return []
  })
  const plus = computeContinuity(components, wires, positiveRoots).energizedTerminals
  const minus = computeContinuity(components, wires, negativeRoots).energizedTerminals
  const lPlus = plc.terminals.find((t) => t.label === 'L+')?.id
  const m = plc.terminals.find((t) => t.label === 'M')?.id
  const powered = !!lPlus && !!m && plus.has(lPlus) && minus.has(m) && !plus.has(m) && !minus.has(lPlus)
  return { powered, positive: plus }
}
