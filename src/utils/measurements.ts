// ============================================================================
// Medições virtuais (multímetro / analisador de rede) calculadas a partir do
// estado real do circuito — não são números decorativos.
// ============================================================================

import type { ElectricalComponent, Wire, Measurement } from '../types'

const VOLT_NOMINAL = 380
const CONTROL_V = 24

function isLive(c: ElectricalComponent, label: string, energized: Set<string>) {
  const t = c.terminals.find((x) => x.label === label)
  return !!(t && energized.has(t.id))
}

export function buildMeasurements(
  components: ElectricalComponent[],
  wires: Wire[],
  energized: Set<string>,
): Measurement[] {
  const out: Measurement[] = []

  // ---- Tensão nos sinais de comando (fonte chaveada / transformador) ----
  const supply = components.find((c) => c.type === 'powerSupply' && c.state.on)
  const trafo = components.find((c) => c.type === 'transformer' && !c.state.failed)
  if (supply || trafo) {
    out.push({
      id: 'm-ctrl',
      ref: supply ? supply.ref : trafo!.ref,
      kind: 'tensão',
      value: supply ? Number(supply.state.outV ?? CONTROL_V) : Number(trafo!.state.secondaryV ?? CONTROL_V),
      unit: 'Vdc',
      ok: true,
    })
  }

  // ---- Tensão trifásica na entrada do primeiro disjuntor geral ----
  const mainBreaker = components.find((c) => c.type === 'breaker3p' || c.type === 'motorBreaker')
  if (mainBreaker) {
    const live = ['1', '3', '5'].filter((l) => isLive(mainBreaker, l, energized)).length
    out.push({
      id: 'm-line',
      ref: mainBreaker.ref,
      kind: 'tensão',
      value: (VOLT_NOMINAL * live) / 3,
      unit: 'V',
      ok: live === 3,
    })
  }

  // ---- Corrente estimada no(s) motor(es) ----
  components
    .filter((c) => c.type === 'motor3ph' || c.type === 'motor1ph')
    .forEach((m) => {
      const cv = Number(m.state.cv ?? 1)
      const nominal = (cv * 736) / (1.732 * VOLT_NOMINAL * 0.86)
      const running = !!m.state.running
      if (running) {
        out.push({
          id: `m-${m.id}-i`,
          ref: m.ref,
          kind: 'corrente',
          value: Number((nominal * 0.92).toFixed(2)),
          unit: 'A',
          ok: true,
        })
        out.push({
          id: `m-${m.id}-f`,
          ref: m.ref,
          kind: 'frequência',
          value: 60,
          unit: 'Hz',
          ok: true,
        })
      } else {
        out.push({ id: `m-${m.id}-i`, ref: m.ref, kind: 'corrente', value: 0, unit: 'A', ok: false })
      }
    })

  // ---- Frequência de saída do inversor ----
  components
    .filter((c) => c.type === 'vfd')
    .forEach((d) => {
      out.push({
        id: `m-${d.id}-f`,
        ref: d.ref,
        kind: 'frequência',
        value: Number(d.state.frequencyHz ?? 0),
        unit: 'Hz',
        ok: !!d.state.running,
      })
    })

  // ---- Cabos: quantidade e metragem estimada ----
  const totalMm = wires.reduce((acc, w) => acc + (w.lengthMm ?? 0), 0)
  out.push({
    id: 'm-wires',
    ref: 'CABEAMENTO',
    kind: 'isolamento',
    value: Number((totalMm / 1000).toFixed(1)),
    unit: 'm',
    ok: true,
  })

  return out
}
