// ============================================================================
// Propagação de identidade de fase (L1/L2/L3).
//
// Além de saber "está energizado", o simulador precisa saber QUAL fase chegou
// em cada borne — só assim é possível decidir o sentido de rotação de um motor
// trifásico a partir da sequência real de fases (L1-L2-L3 = horário,
// L3-L2-L1 = anti-horário), inclusive quando o inversor ou o contator de
// reversão troca dois condutores.
// ============================================================================

import type { ElectricalComponent, Wire } from '../types'
import { internalBridges } from './engine'

export type PhaseTag = 'L1' | 'L2' | 'L3' | 'N' | 'PE' | 'DC+'

export function computePhaseLabels(components: ElectricalComponent[], wires: Wire[]): Map<string, PhaseTag> {
  const adjacency = new Map<string, string[]>()
  const addEdge = (a: string, b: string) => {
    if (!adjacency.has(a)) adjacency.set(a, [])
    if (!adjacency.has(b)) adjacency.set(b, [])
    adjacency.get(a)!.push(b)
    adjacency.get(b)!.push(a)
  }
  for (const w of wires) addEdge(w.fromTerminalId, w.toTerminalId)
  for (const c of components) for (const [a, b] of internalBridges(c)) addEdge(a, b)

  const labels = new Map<string, PhaseTag>()
  const queue: string[] = []

  const seed = (id: string | undefined, tag: PhaseTag) => {
    if (!id) return
    if (labels.has(id)) return
    labels.set(id, tag)
    queue.push(id)
  }

  for (const c of components) {
    const t = (l: string) => c.terminals.find((x) => x.label === l)?.id
    if (c.type === 'busbarPhase') {
      seed(t('L1'), 'L1')
      seed(t('L2'), 'L2')
      seed(t('L3'), 'L3')
    }
    if (c.type === 'busbarNeutral' || c.type === 'powerSupply') seed(c.terminals.find((x) => x.label === 'N')?.id, 'N')
    if (c.type === 'earthBar' || c.type === 'terminalPE') c.terminals.forEach((x) => seed(x.id, 'PE'))
    if (c.type === 'breaker3p' || c.type === 'breaker4p' || c.type === 'motorBreaker' || c.type === 'residualBreaker' || c.type === 'thermalRelay') {
      seed(c.terminals.find((x) => x.label === '1' || x.label === '1L1')?.id, 'L1')
      seed(c.terminals.find((x) => x.label === '3' || x.label === '3L2')?.id, 'L2')
      seed(c.terminals.find((x) => x.label === '5' || x.label === '5L3')?.id, 'L3')
    }
  }

  while (queue.length) {
    const cur = queue.shift()!
    const tag = labels.get(cur)!
    for (const nb of adjacency.get(cur) ?? []) {
      if (!labels.has(nb)) {
        labels.set(nb, tag)
        queue.push(nb)
      }
    }
  }
  return labels
}

export type MotorDirection = 'cw' | 'ccw' | 'stopped' | 'unknown'

/** Decide o sentido de rotação a partir da sequência de fases em U1/V1/W1. */
export function motorDirectionFromPhases(motor: ElectricalComponent, labels: Map<string, PhaseTag>, energized: Set<string>): MotorDirection {
  const u = motor.terminals.find((t) => t.label === 'U1')
  const v = motor.terminals.find((t) => t.label === 'V1')
  const w = motor.terminals.find((t) => t.label === 'W1')
  if (!u || !v || !w) return 'stopped'
  const allLive = [u, v, w].every((t) => energized.has(t.id))
  if (!allLive) return 'stopped'
  const seq = [u, v, w].map((t) => labels.get(t.id))
  if (seq.join('-') === 'L1-L2-L3') return 'cw'
  if (seq.join('-') === 'L3-L2-L1') return 'ccw'
  if (seq.every((s) => s === undefined)) return 'unknown'
  return 'cw'
}
