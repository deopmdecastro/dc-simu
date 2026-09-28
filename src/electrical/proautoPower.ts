import type { ElectricalComponent, Wire } from '../types'
import { computeContinuity, sourceTerminalIds } from './engine'

/** Rede AC aproximada por dois potenciais separados; não mede volts/frequência/corrente. */
export function proautoInputPowered(ps: ElectricalComponent, components: ElectricalComponent[], wires: Wire[]): boolean {
  const terminals = new Map(components.flatMap((c) => c.terminals.map((t) => [t.id, t] as const)))
  const roots = sourceTerminalIds(components.filter((c) => c.id !== ps.id))
  const phases = roots.filter((id) => terminals.get(id)?.kind === 'power-in')
  const neutrals = roots.filter((id) => terminals.get(id)?.kind === 'neutral')
  const live = computeContinuity(components, wires, phases).energizedTerminals
  const neutral = computeContinuity(components, wires, neutrals).energizedTerminals
  const l = ps.terminals.find((t) => t.label === 'L')?.id
  const n = ps.terminals.find((t) => t.label === 'N')?.id
  return !!ps.state.on && !!l && !!n && live.has(l) && neutral.has(n) && !live.has(n) && !neutral.has(l)
}
