/**
 * Quadro geral de parede da maquete de estampagem (QGD da nave).
 *
 * Reaproveita o Quadro Geral de Distribuição nativo — invólucro IP66 com bucins, 4 calhas DIN,
 * calhas técnicas, interruptor de corte 4P, DPS (4× WEG SPW02), medidor KWS-306, sinalização de fases iIL 3P, barramento
 * em escada, diferenciais 4P/2P, RCBO, pentes, disjuntores terminais, régua PTI 6, barras N/PE,
 * cablagem com ponteiras e chicotes filaçados — sem as cargas de campo da casa. Os circuitos
 * ficam com as funções da nave e acrescentam-se dois disjuntores de reserva.
 *
 * Os ids são prefixados por montagem (pode haver várias maquetes no mesmo projeto).
 */
import { createComponent } from './factory'
import { nativeQuadroDistribuicaoContent } from '../project/nativeQuadroDistribuicao'
import type { ElectricalComponent, Wire } from '../types'

/** Cargas de campo do QGD nativo (casa) que não pertencem à nave da maquete. */
const FIELD_LOADS = new Set(['LUM1', 'TOM_GERAL', 'TOM_GERAL2', 'TOM_ESP', 'TOM_TRIF', 'QM1', 'M1'])

/** Função de cada circuito no quadro da nave (referência → etiqueta). */
export const WALL_PANEL_CIRCUITS: Record<string, string> = {
  QE1: 'QGD · Quadro geral da nave de estampagem (800×1000×250 mm)',
  QG1: 'Interruptor de corte geral 4P 100 A · QGD',
  PM1: 'Medidor trifásico KWS-306 · consumo da nave',
  HL1: 'Sinalização de fases L1/L2/L3 · falta de fase',
  ID_TRIF: 'Diferencial 4P 40 A 30 mA · setor trifásico',
  ID_GERAL: 'Diferencial 2P 25 A 30 mA · maquete e iluminação',
  RCBO_ESP: 'RCBO 1P+N C16 30 mA · compressor',
  Q_ILUM: 'Q1 · Iluminação da nave · C10',
  Q_TOM1: 'Q2 · Maquete de estampagem (fonte 24 V) · C16',
  Q_TOM2: 'Q3 · Tomadas da nave · C16',
  Q_ESP: 'Q4 · Compressor de ar 230 V · C20',
  Q_TRIF: 'Q5 · Reserva trifásica 3P C25',
  'X1.1': 'L · Iluminação', 'X1.2': 'N · Iluminação',
  'X1.3': 'L · Maquete (esteira → bancada)', 'X1.4': 'L · Tomadas da nave', 'X1.5': 'N · Maquete / tomadas',
  'X1.6': 'L · Compressor (esteira → compressor)', 'X1.7': 'N · Compressor',
  'X1.8': 'L1 · Reserva', 'X1.9': 'L2 · Reserva', 'X1.10': 'L3 · Reserva',
  'X1.11': 'L · Reserva Q_RES1', 'X1.12': 'L · Reserva Q_RES2',
}

/** Marcação curta na plaqueta de cada borne de saída. */
const STRIP_MARKERS: Record<string, string> = {
  'X1.1': 'ILUM', 'X1.2': 'N', 'X1.3': 'MAQ', 'X1.4': 'TOM', 'X1.5': 'N',
  'X1.6': 'COMP', 'X1.7': 'N', 'X1.8': 'RES', 'X1.9': 'RES', 'X1.10': 'RES', 'X1.11': 'RES', 'X1.12': 'RES',
}

export interface WallPanelContent {
  components: ElectricalComponent[]
  wires: Wire[]
  /** Id do invólucro (âncora do pavilhão fabril). */
  enclosureId: string
}

/**
 * Conteúdo do quadro de parede, deslocado no Esquema por (dx, dy) px.
 * `prefix` torna os ids únicos por montagem.
 */
export function stampingWallPanelContent(prefix: string, dx = 0, dy = 0): WallPanelContent {
  const raw = nativeQuadroDistribuicaoContent()
  const all = raw.components as ElectricalComponent[]
  const dropIds = new Set(all.filter((c) => FIELD_LOADS.has(c.ref)).map((c) => c.id))
  const dropTerminals = new Set(all.filter((c) => dropIds.has(c.id)).flatMap((c) => c.terminals.map((t) => t.id)))
  const kept = all.filter((c) => !dropIds.has(c.id))
  const keptWires = (raw.wires as Wire[]).filter((w) => !dropTerminals.has(w.fromTerminalId) && !dropTerminals.has(w.toTerminalId))

  // Prefixar todos os ids (componentes, bornes, cabos, calhas, chicotes) de uma só vez.
  const json = JSON.stringify({ components: kept, wires: keptWires }).replace(/"(qd-|chicote-qgd)/g, `"${prefix}$1`)
  const content = JSON.parse(json) as { components: ElectricalComponent[]; wires: Wire[] }
  const enclosure = content.components.find((c) => c.type === 'panelEnclosure')!

  // Aparelhos com modelo 3D real no lugar dos genéricos do QGD nativo (sem GLB, ocultos na biblioteca):
  // corte geral → interruptor de corte Schneider Easy9 4P 100 A (mesmos bornes 1…8);
  // DPS tetrapolar genérico → 4 módulos WEG SPW02-275 (L1, L2, L3, N), cada um com o seu PE.
  const swap = (ref: string, type: Parameters<typeof createComponent>[0], state: Record<string, unknown>) => {
    const i = content.components.findIndex((c) => c.ref === ref)
    const old = content.components[i]
    const c = createComponent(type, old.ref, old.label, 0, old.schematicX, old.schematicY)
    const { railId, railOffsetMm, enclosureId } = old as ElectricalComponent & { railOffsetMm?: number }
    Object.assign(c, { id: old.id, railId, railOffsetMm, enclosureId })
    c.terminals = c.terminals.map((t) => ({ ...t, id: `${old.id}-${t.label}`, componentId: old.id }))
    c.state = { ...c.state, ...state }
    content.components[i] = c
    return c
  }
  const main = swap('QG1', 'switchSchneiderEz9s4p', { closed: true })
  // Polo de neutro do corte geral (7 → 8), como no QGD nativo.
  main.terminals = main.terminals.map((t) => (t.label === '7' || t.label === '8' ? ((t) => ({ ...t, kind: 'neutral' as const, electricalClass: 'ac' as const, color: '#2563eb' }))(t) : t))
  const dpsOld = content.components.find((c) => c.ref === 'DPS1')!
  const dpsTerminals = new Set(dpsOld.terminals.map((t) => t.id))
  content.wires = content.wires.filter((w) => !dpsTerminals.has(w.fromTerminalId) && !dpsTerminals.has(w.toTerminalId))
  content.components = content.components.filter((c) => c.id !== dpsOld.id)
  const peBar = content.components.find((c) => c.ref === 'PE_BAR')!
  const qg1 = content.components.find((c) => c.ref === 'QG1')!
  const dpsOffset = (dpsOld as ElectricalComponent & { railOffsetMm?: number }).railOffsetMm ?? 210
  ;([['L1', '2', 'black', 'PE2'], ['L2', '4', 'brown', 'PE3'], ['L3', '6', 'grey', 'PE4'], ['N', '8', 'blue', 'PE5']] as const).forEach(([pole, from, color, pe], i) => {
    const d = createComponent('surgeProtectorWegSpw02', `DPS${i + 1}`, `DPS classe II · ${pole}`, 0, dpsOld.schematicX + i * 27, dpsOld.schematicY)
    d.id = `${prefix}qd-dps-${pole.toLowerCase()}`
    d.terminals = d.terminals.map((t) => ({ ...t, id: `${d.id}-${t.label}`, componentId: d.id }))
    Object.assign(d, { railId: dpsOld.railId, railOffsetMm: dpsOffset + i * 18, enclosureId: dpsOld.enclosureId })
    d.state = { ...d.state, labelText: `DPS ${pole}` }
    if (pole === 'N') d.terminals = d.terminals.map((t) => (t.label === 'L' ? ((t) => ({ ...t, kind: 'neutral' as const, electricalClass: 'ac' as const, color: '#2563eb' }))(t) : t))
    content.components.push(d)
    const wire = (num: string, a: string, b: string, c: Wire['color'], gauge: string): Wire => ({
      id: `${prefix}qd-wire-${num.toLowerCase()}`, fromTerminalId: a, toTerminalId: b, color: c, gauge, number: num,
      kind: c === 'green-yellow' ? 'earth' : c === 'blue' ? 'neutral' : 'power', flexibility: 'flexible', endType: 'ferrule',
      fromEndType: 'ferrule', toEndType: 'ferrule', route: 'manhattan', bend: 0.5, curveOffset: 0, energized: false,
    } as Wire)
    const t = (c: ElectricalComponent, label: string) => c.terminals.find((x) => x.label === label)!.id
    content.wires.push(
      wire(`WD${i + 1}`, t(qg1, from), t(d, 'L'), color, '4mm²'),
      wire(`PED${i + 1}`, t(d, 'PE'), t(peBar, pe), 'green-yellow', '4mm²'),
    )
  })

  // Dois disjuntores de reserva (abertos) na fila 3, depois do pente trifásico.
  const tr3 = content.components.find((c) => c.ref === 'TR3')!
  const reserve = (n: number, offsetMm: number) => {
    const c = createComponent('breakerSchneiderIc60h1p', `Q_RES${n}`, `Q${5 + n} · Reserva · C16 (desligado)`, 0, tr3.schematicX + offsetMm * 1.5, 30)
    c.id = `${prefix}qd-q-res${n}`
    c.terminals = c.terminals.map((t) => ({ ...t, id: `${c.id}-${t.label}`, componentId: c.id }))
    Object.assign(c, { railId: tr3.id, railOffsetMm: offsetMm, enclosureId: enclosure.id })
    c.state = { ...c.state, closed: false, tripped: false, inA: 16, curve: 'C', poles: 1, icn: '10 kA', code: 'A9F84116', labelText: 'RESERVA' }
    return c
  }
  const res1 = reserve(1, 400), res2 = reserve(2, 418)
  // Bornes de saída das reservas (X1.11 / X1.12) a seguir à régua X1, na fila 4.
  const x10 = content.components.find((c) => c.ref === 'X1.10')!
  const reserveTerminal = (n: number, offsetMm: number) => {
    const t = JSON.parse(JSON.stringify(x10)) as ElectricalComponent
    t.id = `${prefix}qd-x${n}`
    t.ref = `X1.${n}`
    t.terminals = t.terminals.map((term) => ({ ...term, id: `${t.id}-${term.label}`, componentId: t.id, energized: false }))
    t.schematicX = x10.schematicX + (offsetMm - 118) * 1.5
    Object.assign(t, { railOffsetMm: offsetMm })
    return t
  }
  const x11 = reserveTerminal(11, 130), x12 = reserveTerminal(12, 142)
  const nBar = content.components.find((c) => c.ref === 'N_BAR')
  const iil3p = content.components.find((c) => c.type === 'pilotLightSchneiderIil3p')
  if (iil3p) {
    const iilTerms = new Set(iil3p.terminals.map((t) => t.id))
    content.wires = content.wires.filter((w) => !iilTerms.has(w.fromTerminalId) && !iilTerms.has(w.toTerminalId))
    content.components = content.components.filter((c) => c.id !== iil3p.id)
    const baseOffset = (iil3p as ElectricalComponent & { railOffsetMm?: number }).railOffsetMm ?? 290
    const phases = [
      { pole: 'L1', qgOut: '2', wireColor: 'black' as Wire['color'], lightColor: '#ef4444', label: 'FASE L1' },
      { pole: 'L2', qgOut: '4', wireColor: 'brown' as Wire['color'], lightColor: '#f59e0b', label: 'FASE L2' },
      { pole: 'L3', qgOut: '6', wireColor: 'grey' as Wire['color'], lightColor: '#22c55e', label: 'FASE L3' },
    ]
    phases.forEach((p, idx) => {
      const fu = createComponent('fuseHolder', `FU${idx + 1}`, `Fusível ${p.pole} · 2 A gG`, 0, iil3p.schematicX + idx * 27, iil3p.schematicY)
      fu.id = `${prefix}qd-fu-${p.pole.toLowerCase()}`
      fu.terminals = fu.terminals.map((t) => ({ ...t, id: `${fu.id}-${t.label}`, componentId: fu.id }))
      Object.assign(fu, { railId: iil3p.railId, railOffsetMm: baseOffset + idx * 18, enclosureId: iil3p.enclosureId })
      fu.state = { ...fu.state, closed: true, blown: false, inA: 2, fuseClass: 'gG', labelText: `FU ${p.pole}` }

      const h = createComponent('pilotLightSchneiderIil1p', `H_${p.pole}`, `Sinalizador ${p.pole}`, 0, iil3p.schematicX + (idx + 3) * 27, iil3p.schematicY)
      h.id = `${prefix}qd-h-${p.pole.toLowerCase()}`
      h.terminals = h.terminals.map((t) => ({ ...t, id: `${h.id}-${t.label}`, componentId: h.id }))
      Object.assign(h, { railId: iil3p.railId, railOffsetMm: baseOffset + (idx + 3) * 18, enclosureId: iil3p.enclosureId })
      h.state = { ...h.state, color: p.lightColor, labelText: p.label }

      content.components.push(fu, h)
      const nDest = nBar?.terminals[idx]?.id ?? term(qg1, '8')
      content.wires.push(
        wire(`WFU${idx + 1}A`, term(qg1, p.qgOut), term(fu, '1'), p.wireColor),
        wire(`WFU${idx + 1}B`, term(fu, '2'), term(h, 'X1'), p.wireColor),
        { ...wire(`WFU${idx + 1}N`, term(h, 'X2'), nDest, 'blue'), kind: 'neutral' },
      )
    })
  }

  content.components.push(res1, res2, x11, x12)
  const term = (c: ElectricalComponent, label: string) => c.terminals.find((t) => t.label === label)!.id
  const bb = content.components.find((c) => c.ref === 'BB_ESCADA')!
  const wire = (num: string, from: string, to: string, color: Wire['color']): Wire => ({
    id: `${prefix}qd-wire-${num.toLowerCase()}`, fromTerminalId: from, toTerminalId: to, color, gauge: '2.5mm²', number: num,
    kind: 'power', flexibility: 'flexible', endType: 'ferrule', fromEndType: 'ferrule', toEndType: 'ferrule', route: 'manhattan', bend: 0.5, curveOffset: 0, energized: false,
  } as Wire)
  content.wires.push(
    wire('W71', term(bb, 'L1.4'), term(res1, '1'), 'black'),
    wire('W72', term(bb, 'L2.4'), term(res2, '1'), 'brown'),
    wire('W73', term(res1, '2'), term(x11, '1'), 'black'),
    wire('W74', term(res2, '2'), term(x12, '1'), 'brown'),
  )

  for (const c of content.components) {
    c.schematicX += dx
    c.schematicY += dy
    const label = WALL_PANEL_CIRCUITS[c.ref]
    if (label) c.label = label
    if (STRIP_MARKERS[c.ref]) c.state = { ...c.state, markerText: STRIP_MARKERS[c.ref] }
  }
  // Referência própria: o QE1 da maquete é o quadro de campo sob a mesa.
  enclosure.ref = 'QGD'
  enclosure.state = {
    ...enclosure.state,
    labelText: 'QGD · NAVE ESTAMPAGEM',
    // Bucins inferiores da casa + saídas superiores para a esteira aérea (maquete e compressor).
    holes: [
      ...((enclosure.state.holes as unknown[]) ?? []),
      { id: 'qgd-out-bench', face: 'top', diameterMm: 32, offsetXmm: 120, offsetYmm: 0, glandType: 'M32' },
      { id: 'qgd-out-compressor', face: 'top', diameterMm: 25, offsetXmm: -120, offsetYmm: 0, glandType: 'M25' },
    ],
  }
  // Os pontos de passagem dos cabos acompanham o deslocamento do Esquema.
  if (dx || dy) for (const w of content.wires) {
    const ww = w as Wire & { waypoints?: Array<{ x: number; y: number }> }
    if (Array.isArray(ww.waypoints)) ww.waypoints = ww.waypoints.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }))
  }
  return { components: content.components, wires: content.wires, enclosureId: enclosure.id }
}
