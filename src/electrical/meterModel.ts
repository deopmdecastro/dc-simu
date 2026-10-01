import { computeContinuity, internalBridges, probe, sourceTerminalIds } from './engine'
import { computePhaseLabels, type PhaseTag } from './phases'
import { EMPTY_METER_INPUT, type MeterInput, type Vars } from '../catalog/behavior'
import type { ComponentDefinition } from '../catalog/types'
import type { ElectricalComponent, Wire } from '../types'

/**
 * Modelo de medição do multímetro virtual. O simulador sabe «quem está energizado» e «qual fase chegou»;
 * daí saem tensões (CA/CC), continuidade e uma estimativa de corrente — não é um solver de malhas.
 */

export const NOMINAL_LINE_V = 400
const PHASE_V = NOMINAL_LINE_V / Math.sqrt(3)
const DC_SOURCE_TYPES = new Set(['powerSupply', 'powerSupplyProauto24A', 'transformer'])

type Tag = { kind: 'ac'; phase: PhaseTag } | { kind: 'dc'; plus: boolean; volts: number } | null

function dcTags(components: ElectricalComponent[], wires: Wire[], energized: Set<string>): Map<string, Tag> {
  const adjacency = new Map<string, string[]>()
  const edge = (a: string, b: string) => { (adjacency.get(a) ?? adjacency.set(a, []).get(a)!).push(b); (adjacency.get(b) ?? adjacency.set(b, []).get(b)!).push(a) }
  for (const wire of wires) if (wire.fromTerminalId && wire.toTerminalId && !wire.fromPoint && !wire.toPoint) edge(wire.fromTerminalId, wire.toTerminalId)
  for (const c of components) if (!DC_SOURCE_TYPES.has(c.type)) for (const [a, b] of internalBridges(c)) edge(a, b)
  const tags = new Map<string, Tag>()
  const spread = (seeds: string[], tag: Tag) => {
    const queue = [...seeds]
    for (const id of seeds) tags.set(id, tag)
    while (queue.length) {
      const current = queue.shift()!
      for (const next of adjacency.get(current) ?? []) if (!tags.has(next)) { tags.set(next, tag); queue.push(next) }
    }
  }
  for (const c of components) {
    const id = (label: string) => c.terminals.find((item) => item.label === label)?.id
    const volts = Number(c.state.outV ?? 24)
    if (c.type === 'powerSupply' && c.state.on && energized.has(id('L') ?? '')) {
      spread([id('+V')].filter(Boolean) as string[], { kind: 'dc', plus: true, volts }); spread([id('-V')].filter(Boolean) as string[], { kind: 'dc', plus: false, volts })
    }
    if (c.type === 'powerSupplyProauto24A' && c.state.powered && c.state.on) {
      spread(['+V1', '+V2'].map(id).filter(Boolean) as string[], { kind: 'dc', plus: true, volts }); spread(['-V1', '-V2'].map(id).filter(Boolean) as string[], { kind: 'dc', plus: false, volts })
    }
  }
  return tags
}

const phasor = (tag: Tag): [number, number] => {
  if (!tag || tag.kind !== 'ac') return [0, 0]
  const angle = tag.phase === 'L1' ? 0 : tag.phase === 'L2' ? -2 * Math.PI / 3 : tag.phase === 'L3' ? 2 * Math.PI / 3 : null
  return angle === null ? [0, 0] : [PHASE_V * Math.cos(angle), PHASE_V * Math.sin(angle)]
}

const LOAD_RULES: Array<{ test: RegExp; amps: (c: ElectricalComponent) => number; on: (c: ElectricalComponent) => boolean }> = [
  { test: /motor/i, amps: (c) => Number(c.state.currentA ?? 1.5), on: (c) => !!c.state.running },
  { test: /pilot|lamp|sinaleiro|beacon|signal/i, amps: () => 0.02, on: (c) => !!c.state.on || !!c.state.lit },
  { test: /contactor|relay|rele/i, amps: () => 0.04, on: (c) => !!c.state.energized },
]

/** Corrente estimada dos consumidores alimentados a jusante da ficha de corrente. */
function downstreamCurrentA(components: ElectricalComponent[], wires: Wire[], energized: Set<string>, start: string, ownId: string): number {
  const graph = computeContinuity(components, wires, [start]).reachable as unknown as Map<string, Set<string>>
  const seen = new Set<string>([start])
  const queue = [start]
  while (queue.length) { const cur = queue.shift()!; for (const next of graph.get(cur) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next) } }
  let total = 0
  for (const c of components) {
    if (c.id === ownId) continue
    const rule = LOAD_RULES.find((item) => item.test.test(c.type))
    if (rule && rule.on(c) && c.terminals.some((t) => seen.has(t.id) && energized.has(t.id))) total += rule.amps(c)
  }
  return total
}

/** Entradas do multímetro `meter` a partir do circuito atual. */
export function meterInputFor(def: ComponentDefinition, meter: ElectricalComponent, components: ElectricalComponent[], wires: Wire[], energized: Set<string>, vars: Vars): MeterInput {
  const behavior = def.behavior
  if (!behavior || behavior.type !== 'multimeter') return EMPTY_METER_INPUT
  const byDef = (defId: string) => meter.terminals.find((item) => item.defId === defId)
  const com = byDef(behavior.com), volt = byDef(behavior.volt), ma = byDef(behavior.milliamp), amp = byDef(behavior.amp)
  const wired = (id?: string) => !!id && wires.some((wire) => wire.fromTerminalId === id || wire.toTerminalId === id)
  const leads = { com: wired(com?.id), volt: wired(volt?.id), ma: wired(ma?.id), amp: wired(amp?.id) }
  const input: MeterInput = { vdc: 0, vac: 0, ohm: null, ma: 0, amp: 0, leads }
  const dial = String(vars.dial ?? 'off')
  if (!com || dial === 'off') return input

  if (dial === 'dcv' || dial === 'acv' || dial === 'ohm') {
    if (!volt || !leads.com || !leads.volt) return input
    const phases = computePhaseLabels(components, wires)
    const tagAc = (id: string): Tag => { const phase = phases.get(id); return phase && energized.has(id) ? { kind: 'ac', phase } : phase === 'N' || phase === 'PE' ? { kind: 'ac', phase } : null }
    const dc = dcTags(components, wires, energized)
    const tagDc = (id: string) => dc.get(id) ?? null
    const dcValue = (tag: Tag) => (tag && tag.kind === 'dc' && tag.plus ? tag.volts : 0)
    input.vdc = dcValue(tagDc(volt.id)) - dcValue(tagDc(com.id))
    const [ax, ay] = phasor(tagAc(com.id)), [bx, by] = phasor(tagAc(volt.id))
    input.vac = Math.hypot(bx - ax, by - ay)
    input.live = Math.abs(input.vdc) > 1 || input.vac > 1
    if (dial === 'ohm') {
      const result = probe(components, wires, com.id, volt.id, energized)
      input.ohm = result.connected ? result.resistanceOhm : null
    }
    return input
  }
  // corrente: o seletor fecha COM—mA/10 A em série (ver `state.meterBridge`)
  const jack = dial === 'ma' ? ma : amp
  if (!jack || !leads.com || !(dial === 'ma' ? leads.ma : leads.amp)) return input
  const sources = sourceTerminalIds(components)
  const live = computeContinuity(components, wires, sources).energizedTerminals
  if (!live.has(com.id) && !live.has(jack.id)) return input
  const amps = downstreamCurrentA(components, wires, live, live.has(com.id) ? jack.id : com.id, meter.id)
  if (dial === 'ma') input.ma = amps * 1000; else input.amp = amps
  return input
}

/** Ponte COM—ficha de corrente que o seletor fecha (guardada no estado do componente para o motor elétrico). */
export function meterBridgeFor(def: ComponentDefinition, meter: ElectricalComponent, vars: Vars): [string, string] | null {
  const behavior = def.behavior
  if (!behavior || behavior.type !== 'multimeter') return null
  const dial = String(vars.dial ?? 'off')
  const jackDef = dial === 'ma' ? behavior.milliamp : dial === 'a10' ? behavior.amp : ''
  if (!jackDef) return null
  const com = meter.terminals.find((item) => item.defId === behavior.com)
  const jack = meter.terminals.find((item) => item.defId === jackDef)
  return com && jack ? [com.label, jack.label] : null
}
