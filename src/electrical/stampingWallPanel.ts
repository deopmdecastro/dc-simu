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
import { syncCombMounted } from '../three/combMount'
import { busbarFootprintPx, busbarTerminalSpecs } from '../three/busbarParts'
import { nativeQuadroDistribuicaoContent } from '../project/nativeQuadroDistribuicao'
import type { ElectricalComponent, Wire } from '../types'

/** Cargas de campo do QGD nativo (casa) que não pertencem à nave da maquete. */
const FIELD_LOADS = new Set(['LUM1', 'TOM_GERAL', 'TOM_GERAL2', 'TOM_ESP', 'TOM_TRIF', 'QM1', 'M1'])

/** Função de cada circuito no quadro da nave (referência → etiqueta). */
export const WALL_PANEL_CIRCUITS: Record<string, string> = {
  QE1: 'QGD · Quadro geral da nave de estampagem (600×800×250 mm)',
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
  // Declarações de função: também disponíveis nos callbacks síncronos de criação
  // do quadro. Evita TDZ ao abrir a Biblioteca e avaliar componentCount.
  function term(c: ElectricalComponent, label: string): string {
    return c.terminals.find((t) => t.label === label)!.id
  }
  function wire(num: string, from: string, to: string, color: Wire['color']): Wire {
    return {
      id: `${prefix}qd-wire-${num.toLowerCase()}`, fromTerminalId: from, toTerminalId: to, color, gauge: '2.5mm²', number: num,
      kind: color === 'blue' ? 'neutral' : 'power', flexibility: 'flexible', endType: 'ferrule', fromEndType: 'ferrule', toEndType: 'ferrule', route: 'manhattan', bend: 0.5, curveOffset: 0, energized: false,
    } as Wire
  }
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
  const iil3p = content.components.find((c) => c.type === 'pilotLightSchneiderIil3p')
  if (iil3p) {
    const iilTerms = new Set(iil3p.terminals.map((t) => t.id))
    content.wires = content.wires.filter((w) => !iilTerms.has(w.fromTerminalId) && !iilTerms.has(w.toTerminalId))
    content.components = content.components.filter((c) => c.id !== iil3p.id)
    const baseOffset = (iil3p as ElectricalComponent & { railOffsetMm?: number }).railOffsetMm ?? 290
    // Três cartuchos num único porta-fusíveis 3P+N do catálogo, com neutro seccionável.
    const fu = createComponent('fuseHolderSchneiderDf103nv', 'FU_H', 'Proteção da sinalização · 3 × 2 A gG + N', 0, iil3p.schematicX, iil3p.schematicY)
    fu.id = `${prefix}qd-fu-phases`
    fu.terminals = fu.terminals.map((t) => ({ ...t, id: `${fu.id}-${t.label}`, componentId: fu.id }))
    Object.assign(fu, { railId: iil3p.railId, railOffsetMm: baseOffset, enclosureId: iil3p.enclosureId })
    fu.state = { ...fu.state, closed: true, blown: false, inA: 2, fuseClass: 'gG', labelText: 'FU · SINALIZAÇÃO' }
    content.components.push(fu)
    content.wires.push(wire('WFUN', term(qg1, '8'), term(fu, 'N1'), 'blue'))
    const phases = [
      { pole: 'L1', qgOut: '2', wireColor: 'black' as Wire['color'], lightColor: '#ef4444', label: 'FASE L1' },
      { pole: 'L2', qgOut: '4', wireColor: 'brown' as Wire['color'], lightColor: '#f59e0b', label: 'FASE L2' },
      { pole: 'L3', qgOut: '6', wireColor: 'grey' as Wire['color'], lightColor: '#22c55e', label: 'FASE L3' },
    ]
    phases.forEach((p, idx) => {
      const h = createComponent('pilotLightSchneiderIil1p', `H_${p.pole}`, `Sinalizador ${p.pole}`, 0, iil3p.schematicX + fu.w + idx * 27, iil3p.schematicY)
      h.id = `${prefix}qd-h-${p.pole.toLowerCase()}`
      h.terminals = h.terminals.map((t) => ({ ...t, id: `${h.id}-${t.label}`, componentId: h.id }))
      Object.assign(h, { railId: iil3p.railId, railOffsetMm: baseOffset + 72 + idx * 18, enclosureId: iil3p.enclosureId })
      h.state = { ...h.state, color: p.lightColor, labelText: p.label }

      content.components.push(h)
      content.wires.push(
        wire(`WFU${idx + 1}A`, term(qg1, p.qgOut), term(fu, String(idx * 2 + 1)), p.wireColor),
        wire(`WFU${idx + 1}B`, term(fu, String(idx * 2 + 2)), term(h, 'X1'), p.wireColor),
        wire(`WFU${idx + 1}N`, term(h, 'X2'), term(fu, 'N2'), 'blue'),
      )
    })
  }

  content.components.push(res1, res2, x11, x12)
  const bb = content.components.find((c) => c.ref === 'BB_ESCADA')!
  content.wires.push(
    wire('W71', term(bb, 'L1.4'), term(res1, '1'), 'black'),
    wire('W72', term(bb, 'L2.4'), term(res2, '1'), 'brown'),
    wire('W73', term(res1, '2'), term(x11, '1'), 'black'),
    wire('W74', term(res2, '2'), term(x12, '1'), 'brown'),
  )

  compactWallPanel(content, prefix, enclosure)

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
      { id: 'qgd-out-bench', face: 'top', diameterMm: 25, offsetXmm: 60, offsetYmm: 0, glandType: 'M25' },
      { id: 'qgd-out-compressor', face: 'top', diameterMm: 25, offsetXmm: -60, offsetYmm: 0, glandType: 'M25' },
    ],
  }
  // Os pontos de passagem dos cabos acompanham o deslocamento do Esquema.
  if (dx || dy) for (const w of content.wires) {
    const ww = w as Wire & { waypoints?: Array<{ x: number; y: number }> }
    if (Array.isArray(ww.waypoints)) ww.waypoints = ww.waypoints.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }))
  }
  return { components: content.components, wires: content.wires, enclosureId: enclosure.id }
}

/** px do Esquema por mm (mesma escala do quadro nativo). */
const PX = 1.5

/**
 * Quadro de parede compacto (600 × 800 × 250 mm em vez de 800 × 1000): calhas verticais encostadas às
 * ilhargas, cinco calhas horizontais entre as filas e quatro calhas DIN com os aparelhos juntos
 * (passo modular, 8 mm entre grupos). Todos os aparelhos de calha ficam centrados no perfil — o
 * medidor KWS-306 do quadro nativo estava 21 mm acima da calha.
 *
 * Pentes: o pente 1P (A9XPC) fica ENCAIXADO nos bornes de entrada de Q1–Q3 (adjacentes, passo
 * 18 mm) e é alimentado por um borne de alimentação de pente (`combBusbarConnector`) no 1.º
 * disjuntor. Os cabos pente → disjuntor deixam de existir: a continuidade é a do encaixe. O pente 3P
 * do quadro nativo alimentava um único disjuntor — sai, e Q5 recebe as fases diretamente.
 */
function compactWallPanel(content: { components: ElectricalComponent[]; wires: Wire[] }, prefix: string, enclosure: ElectricalComponent) {
  const W = 600, H = 800
  const byRef = (ref: string) => content.components.find((c) => c.ref === ref)
  const term = (c: ElectricalComponent, label: string) => c.terminals.find((x) => x.label === label)!.id
  const EX = enclosure.schematicX, EY = enclosure.schematicY
  const X = (mm: number) => EX + mm * PX
  const Y = (mm: number) => EY + mm * PX
  enclosure.w = W * PX
  enclosure.h = H * PX
  enclosure.state = {
    ...enclosure.state, widthMm: W, heightMm: H,
    // Bucins inferiores dentro da nova largura (mesmos furos, espaçados 90 mm).
    holes: ((enclosure.state.holes as Array<Record<string, unknown>>) ?? []).map((h, i) => ({ ...h, offsetXmm: (i - 2) * 90 })),
  }
  enclosure.label = 'Quadro Geral da nave (600×800×250 mm)'

  // ── Calhas técnicas: verticais nas ilhargas, horizontais entre filas ──────────────────────
  const DUCT_W = 40
  const vX = [18 + DUCT_W / 2, W - 18 - DUCT_W / 2]
  const vLen = H - 40
  const ducts = content.components.filter((c) => c.type === 'cableDuct')
  const vertical = ducts.filter((c) => (c.rotation ?? 0) % 180 !== 0).sort((a, b) => a.schematicX - b.schematicX)
  const horizontal = ducts.filter((c) => (c.rotation ?? 0) % 180 === 0).sort((a, b) => a.schematicY - b.schematicY)
  vertical.forEach((d, i) => {
    d.w = vLen * PX
    d.state = { ...d.state, lengthMm: vLen }
    d.schematicX = Math.round(X(vX[i] ?? vX[1]) - d.w / 2)
    d.schematicY = Math.round(Y(H / 2) - d.h / 2)
  })
  const hLeft = vX[0] + DUCT_W / 2 + 2, hRight = vX[1] - DUCT_W / 2 - 2
  const hLen = hRight - hLeft
  const ductY = [40, 212, 384, 556, 728]
  horizontal.forEach((d, i) => {
    d.w = hLen * PX
    d.state = { ...d.state, lengthMm: hLen }
    d.schematicX = Math.round(X(hLeft))
    d.schematicY = Math.round(Y(ductY[i] ?? ductY[ductY.length - 1]) - d.h / 2)
  })

  // Centro (antigo) da calha de cada aparelho: preserva o desvio próprio de bornes e barras.
  const oldRailCy = new Map<string, number>()
  for (const c of content.components) {
    const rid = (c as ElectricalComponent & { railId?: string }).railId
    const r = rid ? content.components.find((x) => x.id === rid) : undefined
    if (r) oldRailCy.set(c.id, r.schematicY + r.h / 2)
  }
  // ── Calhas DIN entre as calhas técnicas ────────────────────────────────────────────────────
  const railY = [126, 298, 470, 642]
  const railLeft = hLeft + 6, railLen = hLen - 12
  const rails = content.components.filter((c) => c.type === 'dinRail15x55').sort((a, b) => a.schematicY - b.schematicY)
  rails.forEach((r, i) => {
    r.w = Math.round(railLen * PX)
    r.state = { ...r.state, lengthMm: railLen }
    r.schematicX = Math.round(X(railLeft))
    r.schematicY = Math.round(Y(railY[i]) - r.h / 2)
  })

  // ── Pentes: 1P encaixado em Q1–Q3 + borne de alimentação; o 3P sai ─────────────────────────
  const comb = byRef('BB_COMB1')!
  const comb3p = byRef('BB_COMB2')
  const qIlum = byRef('Q_ILUM')!, qTom1 = byRef('Q_TOM1')!, qTom2 = byRef('Q_TOM2')!, qTrif = byRef('Q_TRIF')!
  const idGeral = byRef('ID_GERAL')!, idTrif = byRef('ID_TRIF')!, nBar = byRef('N_BAR')!
  comb.state = { ...comb.state, combMode: '1P', poleCount: 3, toothCovers: [], neutralSide: undefined }
  // Bornes e pegada gerados a partir do novo estado (3 dentes), como no quadro nativo.
  comb.terminals = busbarTerminalSpecs('busbarComb', comb.state).map((tt) => ({ ...tt, id: `${comb.id}-${tt.label}`, componentId: comb.id, energized: false }))
  Object.assign(comb, busbarFootprintPx('busbarComb', comb.state) ?? {})
  const connector = createComponent('combBusbarConnector', 'XB1', 'Borne de alimentação do pente (L1 · 16 mm²)', 0, 0, 0)
  connector.id = `${prefix}qd-comb-feed`
  connector.terminals = connector.terminals.map((tt) => ({ ...tt, id: `${connector.id}-${tt.label}`, componentId: connector.id }))
  connector.enclosureId = enclosure.id
  connector.state = { ...connector.state, labelText: 'ALIM. PENTE', mountedTerminal: '1' }
  content.components.push(connector)
  const id = (num: string) => `${prefix}qd-wire-${num.toLowerCase()}`
  const dropWires = new Set(['W28', 'W29', 'W59', 'W60', 'W61', 'W62', 'W63'].map(id))
  content.wires = content.wires.filter((w) => !dropWires.has(w.id))
  for (const w of content.wires) {
    // ID_GERAL → borne de alimentação do pente (antes ia direto a um dente do pente).
    if (w.id === id('W27')) w.toTerminalId = term(connector, 'IN')
    // Neutro do setor monofásico direto à barra de neutro (o pente 1P não leva neutro).
    if (w.id === id('W30')) w.toTerminalId = term(nBar, 'N1')
    // Q5 alimentado diretamente pelo ID_TRIF (sem pente para um único disjuntor).
    if (w.id === id('W32')) w.toTerminalId = term(qTrif, '1')
    if (w.id === id('W33')) w.toTerminalId = term(qTrif, '3')
    if (w.id === id('W34')) w.toTerminalId = term(qTrif, '5')
  }
  if (comb3p) content.components = content.components.filter((c) => c.id !== comb3p.id)
  void idGeral; void idTrif

  // ── Aparelhos: juntos na calha, por grupos ─────────────────────────────────────────────────
  const GROUP_GAP = 8
  const rows: string[][][] = [
    [['REDE'], ['QG1'], ['DPS1', 'DPS2', 'DPS3', 'DPS4'], ['PM1'], ['FU_H', 'H_L1', 'H_L2', 'H_L3']],
    [['BB_ESCADA'], ['ID_TRIF'], ['ID_GERAL'], ['RCBO_ESP']],
    [['Q_ILUM', 'Q_TOM1', 'Q_TOM2'], ['Q_ESP'], ['Q_TRIF'], ['Q_RES1', 'Q_RES2']],
    [['X1.1', 'X1.2', 'X1.3', 'X1.4', 'X1.5', 'X1.6', 'X1.7', 'X1.8', 'X1.9', 'X1.10', 'X1.11', 'X1.12'], ['N_BAR'], ['PE_BAR']],
  ]
  // Desvio vertical do aparelho em relação ao eixo da calha, como no quadro nativo (bornes PTI e barras
  // N/PE assentam em pés próprios); o medidor fica centrado no perfil como os restantes modulares.
  const nativeDy: Record<string, number> = {}
  rows.forEach((groups, ri) => {
    const rail = rails[ri]
    const railCy = rail.schematicY + rail.h / 2
    let cursor = rail.schematicX + 6 * PX
    groups.forEach((group, gi) => {
      if (gi) cursor += GROUP_GAP * PX
      for (const ref of group) {
        const c = byRef(ref)
        if (!c) continue
        const dy = c.type === 'meterKws306' ? -3 : (nativeDy[ref] ?? Math.max(-40, Math.min(3, Math.round((c.schematicY + c.h / 2) - (oldRailCy.get(c.id) ?? railCy)))))
        c.schematicX = Math.round(cursor)
        c.schematicY = Math.round(railCy + dy - c.h / 2)
        Object.assign(c, { railId: rail.id, railOffsetMm: Math.round(((cursor - rail.schematicX) / PX) * 10) / 10 })
        cursor += c.w
      }
    })
  })

  // Pente e borne de alimentação encaixados nos bornes de entrada de Q1 (pinos nos bornes 1 de Q1–Q3).
  Object.assign(comb, { mountedOn: qIlum.id, railId: undefined, railOffsetMm: undefined, schematicX: qIlum.schematicX, schematicY: qIlum.schematicY - comb.h })
  Object.assign(connector, { mountedOn: qIlum.id, schematicX: qIlum.schematicX, schematicY: qIlum.schematicY - connector.h })
  content.components = syncCombMounted(content.components)
  void qTom1; void qTom2
}
