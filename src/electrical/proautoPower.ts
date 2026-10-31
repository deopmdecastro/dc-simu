import type { ElectricalComponent, Wire } from '../types'
import { computeContinuity, sourceTerminalIds } from './engine'

/** Rede AC aproximada por dois potenciais separados; não mede volts/frequência/corrente. */
export function proautoInputPowered(ps: ElectricalComponent, components: ElectricalComponent[], wires: Wire[]): boolean {
  const terminals = new Map(components.flatMap((c) => c.terminals.map((t) => [t.id, t] as const)))
  const roots = sourceTerminalIds(components.filter((c) => c.id !== ps.id), undefined, wires)
  const neutrals = roots.filter((id) => terminals.get(id)?.kind === 'neutral')
  const neutral = computeContinuity(components, wires, neutrals).energizedTerminals
  // Um polo de entrada de disjuntor (kind 'power-in') que está ligado ao neutro da rede
  // (ex.: 2.º polo de um 2P a levar N) é neutro, não fase: sem esta exclusão o N da fonte
  // aparecia como «energizado em fase» e a fonte nunca arrancava.
  const phases = roots.filter((id) => terminals.get(id)?.kind === 'power-in' && !neutral.has(id))
  const live = computeContinuity(components, wires, phases).energizedTerminals
  const l = ps.terminals.find((t) => t.label === 'L')?.id
  const n = ps.terminals.find((t) => t.label === 'N')?.id
  return !!ps.state.on && !!l && !!n && live.has(l) && neutral.has(n) && !live.has(n) && !neutral.has(l)
}
