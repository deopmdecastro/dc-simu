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
import { internalBridges, poleTerminalPairs } from './engine'
import { industrialDeviceTypeOf } from './industrialDevices'
import { terminalStripJumperPairs } from './pti6Strip'
import { combTerminalConductorOf, steppedTerminalBarOf } from '../three/busbarParts'

export type PhaseTag = 'L1' | 'L2' | 'L3' | 'N' | 'PE' | 'DC+'

export function computePhaseLabels(components: ElectricalComponent[], wires: Wire[]): Map<string, PhaseTag> {
  /** Grafo de identidade de fase. `topology` acrescenta os polos dos aparelhos mesmo abertos. */
  const graph = (topology: boolean) => {
    const adjacency = new Map<string, string[]>()
    const addEdge = (a: string, b: string) => {
      if (!adjacency.has(a)) adjacency.set(a, [])
      if (!adjacency.has(b)) adjacency.set(b, [])
      adjacency.get(a)!.push(b)
      adjacency.get(b)!.push(a)
    }
    for (const w of wires) if (w.kind !== 'hydraulic' && w.kind !== 'pneumatic' && w.fromTerminalId && w.toTerminalId && !w.fromPoint && !w.toPoint) addEdge(w.fromTerminalId, w.toTerminalId)
    for (const c of components) {
      for (const [a, b] of internalBridges(c)) addEdge(a, b)
      if (topology) for (const [a, b] of poleTerminalPairs(c)) addEdge(a, b)
    }
    for (const [a, b] of terminalStripJumperPairs(components)) addEdge(a, b)
    return adjacency
  }
  const adjacency = graph(false)
  // Caminhos vivos primeiro. Só os bornes que ficaram sem identidade — porque o único caminho
  // passa por um polo aberto — são resolvidos pela topologia. Assim «qual é a fase deste
  // condutor» sobrevive a um contactor desligado, sem confundir as duas fases de um inversor
  // (L1 pelo KM1 e L3 pelo KM2 chegam ao mesmo borne do motor).
  const topology = graph(true)

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
    if (c.type === 'powerSource24v' && c.state.on !== false) { seed(t('+24V'), 'DC+'); seed(t('0V'), 'N'); seed(t('PE'), 'PE') }
    if (c.type === 'powerSupplyProauto24A' && c.state.powered && c.state.on !== false) {
      for (const label of ['+V1','+V2']) seed(t(label), 'DC+')
      for (const label of ['-V1','-V2']) seed(t(label), 'N')
    }
    if (industrialDeviceTypeOf(c) === 'vfdSchneiderAtv320') {
      seed(t('PE-IN'), 'PE'); seed(t('PE-OUT'), 'PE')
      if (c.state.powered) { seed(t('+24'), 'DC+'); seed(t('10V'), 'DC+'); seed(t('COM1'), 'N'); seed(t('COM2'), 'N') }
      if (c.state.running && c.state.stoReleased) {
        seed(t('U/T1'), c.state.direction === 'ccw' ? 'L3' : 'L1'); seed(t('V/T2'), 'L2'); seed(t('W/T3'), c.state.direction === 'ccw' ? 'L1' : 'L3')
      }
    }
    if (c.type === 'busbarPhase') {
      seed(t('L1'), 'L1')
      seed(t('L2'), 'L2')
      seed(t('L3'), 'L3')
    }
    if (c.type === 'busbarPhaseAcrylic' && c.state.source === true) {
      const sp = c.state.sourcePhase
      if (sp === 'L1' || sp === 'L2' || sp === 'L3') seed(c.terminals[0]?.id, sp)
    }
    if (c.type === 'busbarPhaseStepped' && c.state.source === true) {
      const done = new Set<string>()
      for (const x of c.terminals) {
        const bar = steppedTerminalBarOf(x.label)
        if (!bar || done.has(bar)) continue
        done.add(bar)
        seed(x.id, bar)
      }
    }
    if (c.type === 'busbarComb' && c.state.source === true) {
      const done = new Set<string>()
      const sp = c.state.sourcePhase
      for (const x of c.terminals) {
        const cond = combTerminalConductorOf(x.label)
        if (!cond || done.has(cond)) continue
        done.add(cond)
        if (cond === 'L') {
          if (sp === 'L1' || sp === 'L2' || sp === 'L3' || sp === 'N') seed(x.id, sp)
        } else {
          seed(x.id, cond)
        }
      }
    }
    if (c.type === 'powerSource1ph') {
      seed(t('PE'), 'PE')
      if (c.state.on !== false) {
        seed(t('L'), 'L1')
        seed(t('N'), 'N')
      }
    }
    if (c.type === 'powerSource3ph') {
      seed(t('PE'), 'PE')
      if (c.state.on !== false) {
        seed(t('L1'), 'L1')
        seed(t('L2'), 'L2')
        seed(t('L3'), 'L3')
        seed(t('N'), 'N')
      }
    }
    if (c.type === 'busbarNeutral' && c.state.source !== false) c.terminals.forEach((x) => seed(x.id, 'N'))
    if (c.type === 'powerSupply') seed(c.terminals.find((x) => x.label === 'N')?.id, 'N')
    if (c.type === 'earthBar' || c.type === 'terminalPE') c.terminals.forEach((x) => seed(x.id, 'PE'))
    if (c.type === 'breaker3p' || c.type === 'breaker4p' || c.type === 'motorBreaker' || c.type === 'motorBreakerPkzmC10' || c.type === 'motorBreakerSchneiderGv2me' || c.type === 'residualBreaker' || c.type === 'thermalRelay' || c.type === 'thermalRelaySiemens3ru1116') {
      seed(c.terminals.find((x) => x.label === '1' || x.label === '1L1')?.id, 'L1')
      seed(c.terminals.find((x) => x.label === '3' || x.label === '3L2')?.id, 'L2')
      seed(c.terminals.find((x) => x.label === '5' || x.label === '5L3')?.id, 'L3')
    }
    if (c.type === 'residualBreaker' || c.type === 'residualBreakerHagerCfc225p' || c.type === 'fuseHolderSchneiderDf81n' || c.type === 'fuseHolderSchneiderDf103nv') {
      seed(c.terminals.find((x) => x.label === 'N1')?.id, 'N')
    }
  }

  const spread = (adj: Map<string, string[]>) => {
    while (queue.length) {
      const cur = queue.shift()!
      const tag = labels.get(cur)!
      for (const nb of adj.get(cur) ?? []) {
        if (!labels.has(nb)) {
          labels.set(nb, tag)
          queue.push(nb)
        }
      }
    }
  }
  spread(adjacency)
  if (labels.size < topology.size) {
    for (const id of labels.keys()) queue.push(id)
    spread(topology)
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
