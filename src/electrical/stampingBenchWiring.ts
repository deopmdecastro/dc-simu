/**
 * Cablagem da maquete de estampagem, derivada das cotas reais das peças de `stampingBenchLayout`:
 *
 * 1. Alimentação 230 V em cabo 3G2,5 (L castanho, N azul, PE verde/amarelo), do QGD às tomadas RoadEu:
 *    borne de saída X1 → bucim superior do QGD → subida → pescoço → esteira aérea → ramal/pescoço →
 *    descida → bucim superior da tomada → bornes L/N/PE. Ponteiras nas duas pontas, condutores filaçados.
 * 2. Cabos de campo segundo o relatório Ex10 (S7-300): X21 = entradas I0.0…I1.7, X22 = saídas
 *    Q0.0…Q1.5 (bobinas do CPV10 e coluna luminosa), X23 = motor M1, X24 = botões de reserva,
 *    X25 / X26 = +24 V / 0 V dos sensores (ponteiras duplas, pontes entre bornes).
 *    Percurso: aparelho → calha perimetral da base → descida pela perna → calha inferior → bucim lateral
 *    do QE1 → calha técnica → borne (ponta de campo = borne `2`; distribuição pela calha intermédia).
 *
 * Coordenadas em mm relativas ao centro da base (como `BenchPlacement`).
 */
import * as THREE from 'three'
import type { ComponentType, WireColor, WireKind } from '../types'
import type { BenchPlacement } from './stampingBench'
import { BENCH_TERMINAL_STRIPS } from './stampingBench'
import { createComponent } from './factory'
import { mechatronicsSizeMm, slotPlateDimsOf } from '../three/mechatronicsModel'
import { pneumaticComponentSizeMm } from '../three/pneumaticsModel'
import { COMPONENT_PHYSICAL_SIZE_MM } from '../three/modelPaths'
import { SOCKET_DEVICES } from './socketDevices'

export interface BenchPointMm { x: number; y: number; z: number }

/** Ponta de um cabo: peça da maquete (`key`) ou aparelho do QGD (`ref`), e o rótulo do borne. */
export type BenchWireEnd = { key: string; label: string } | { ref: string; label: string }

export interface BenchWireSpec {
  id: string
  number: string
  label: string
  from: BenchWireEnd
  to: BenchWireEnd
  color: WireColor
  gauge: string
  kind: WireKind
  waypointsMm: BenchPointMm[]
  /** Chicote: condutores do mesmo cabo filaçados com abraçadeiras. */
  bundleId?: string
  /** Terminação por ponta (por omissão ponteira simples): `ferruleDouble` onde dois condutores partilham o borne. */
  fromEnd?: 'ferrule' | 'ferruleDouble'
  toEnd?: 'ferrule' | 'ferruleDouble'
}

/** Tag do relatório Ex10 → peça e borne do aparelho de campo (sem entrada = ligação interna ao QE1). */
export const BENCH_FIELD_SOURCES: Record<string, { key: string; label: string } | undefined> = {
  C1_FC_0: { key: 'feeder', label: 'REC' },
  C1_FC_1: { key: 'feeder', label: 'AVA' },
  C3_FC_1: { key: 'drawerCylinder', label: 'AVA' },
  C3_FC_0: { key: 'drawerCylinder', label: 'REC' },
  C4_FC_0: { key: 'press', label: 'SUP' },
  C4_FC_1: { key: 'press', label: 'INF' },
  SENSOR_COR: { key: 'opticalSensor', label: 'OUT' },
  FC2: { key: 'fc2', label: 'NO' },
  FC1: { key: 'fc1', label: 'NO' },
  SENSOR_INDUTIVO: { key: 'inductiveSensor', label: 'OUT' },
  C2_FC_1: { key: 'arm', label: 'B6' },
  C2_FC_0: { key: 'arm', label: 'B7' },
  B_START: { key: 'operator-start', label: '4' },
  B_STOP_NF: { key: 'operator-stop', label: '2' },
  INT_MAN: { key: 'operator-mode', label: '14' },
  B_EMERG_NF: { key: 'operator-emergency', label: '22' },
  'Y0_C1+': { key: 'valveTerminal', label: 'Y0' },
  'Y1_C1-': { key: 'valveTerminal', label: 'Y1' },
  'Y3_C2-': { key: 'valveTerminal', label: 'Y3' },
  'Y2_C2+': { key: 'valveTerminal', label: 'Y2' },
  VACUO_ON: { key: 'valveTerminal', label: 'VON' },
  VACUO_OFF: { key: 'valveTerminal', label: 'VOFF' },
  'Y5_C3-': { key: 'valveTerminal', label: 'Y5' },
  'Y4_C3+': { key: 'valveTerminal', label: 'Y4' },
  'Y6_C4+': { key: 'valveTerminal', label: 'Y6' },
  L_VERDE: { key: 'signalTower', label: 'G' },
  L_AMRL: { key: 'signalTower', label: 'Y' },
  L_VERM: { key: 'signalTower', label: 'R' },
  'M1 +': { key: 'motor', label: 'CW' },
  'M1 -': { key: 'motor', label: 'CCW' },
  'ENC A': { key: 'motor', label: 'A' },
  'ENC B': { key: 'motor', label: 'B' },
  'REARME (reserva)': { key: 'operator-reset', label: '4' },
  'CICLO (reserva)': { key: 'operator-cycle', label: '14' },
}

/** Alimentação dos sensores/atuadores: +24 V em X25, 0 V em X26 (dois condutores por borne). */
export const BENCH_SUPPLY_LOADS: ReadonlyArray<{ key: string; label: string; rail: '+24V' | '0V' }> = [
  { key: 'feeder', label: 'REC+', rail: '+24V' }, { key: 'feeder', label: 'AVA+', rail: '+24V' },
  { key: 'drawerCylinder', label: 'REC+', rail: '+24V' }, { key: 'drawerCylinder', label: 'AVA+', rail: '+24V' },
  { key: 'press', label: 'SUP+', rail: '+24V' }, { key: 'press', label: 'INF+', rail: '+24V' },
  { key: 'arm', label: 'B6+', rail: '+24V' }, { key: 'arm', label: 'B7+', rail: '+24V' },
  { key: 'opticalSensor', label: '+24V', rail: '+24V' }, { key: 'inductiveSensor', label: '+24V', rail: '+24V' },
  { key: 'fc1', label: 'C', rail: '+24V' }, { key: 'fc2', label: 'C', rail: '+24V' },
  { key: 'operator-emergency', label: '21', rail: '+24V' }, { key: 'motor', label: '+24V', rail: '+24V' },
  { key: 'opticalSensor', label: '0V', rail: '0V' }, { key: 'inductiveSensor', label: '0V', rail: '0V' },
  { key: 'motor', label: '0V', rail: '0V' }, { key: 'valveTerminal', label: '0V', rail: '0V' },
  { key: 'signalTower', label: 'COM', rail: '0V' },
]

const STRIP_COLORS: Record<string, WireColor> = { X21: 'black', X22: 'violet', X23: 'grey', X24: 'black' }

const SIDE_H = 60 // abas das esteiras perfuradas
const R_FLOOR = 4.5 // fundo (2,5 mm) + raio do condutor 2,5 mm² flexível

function sizeOfMm(type: ComponentType, state?: Record<string, unknown>): BenchPointMm {
  const mec = mechatronicsSizeMm(type, state)
  if (mec) return mec
  const pn = pneumaticComponentSizeMm(type, state)
  if (pn) return pn
  const s = COMPONENT_PHYSICAL_SIZE_MM[type]
  return s ? { x: s.width, y: s.height, z: s.depth } : { x: 0, y: 0, z: 0 }
}

/**
 * Operadores da caixa de comando: os bornes ficam no bloco de contactos, atrás (dentro da caixa),
 * e não na face do botão. Aplicado por componente ao montar a maquete e usado no percurso dos cabos.
 */
export function benchTerminalOverrides(part: Pick<BenchPlacement, 'key' | 'type'>): Record<string, { position3D: { x: number; y: number; z: number }; face: 'back' }> {
  // Coluna luminosa: o cabo de 4 fios (R, Y, G, COM) sai pela traseira da base.
  if (part.key === 'signalTower') {
    const out: Record<string, { position3D: { x: number; y: number; z: number }; face: 'back' }> = {}
    ;['R', 'Y', 'G', 'COM'].forEach((label, k) => { out[label] = { position3D: { x: 0.38 + k * 0.08, y: 0.05, z: 0.02 }, face: 'back' } })
    return out
  }
  if (!part.key.startsWith('operator-')) return {}
  const labels = createComponent(part.type).terminals.map((t) => t.label)
  const out: Record<string, { position3D: { x: number; y: number; z: number }; face: 'back' }> = {}
  labels.forEach((label, k) => {
    out[label] = { position3D: { x: labels.length > 1 ? 0.3 + (0.4 * k) / (labels.length - 1) : 0.5, y: 0.35, z: 0.03 }, face: 'back' }
  })
  return out
}

const FACE_NORMALS: Record<string, [number, number, number]> = {
  front: [0, 0, 1], back: [0, 0, -1], left: [-1, 0, 0], right: [1, 0, 0], top: [0, 1, 0], bottom: [0, -1, 0],
}

/** Posição (mm) e normal de saída de um borne de uma peça da maquete, com a orientação aplicada. */
export function benchTerminalPointMm(part: BenchPlacement, label: string): { p: BenchPointMm; n: BenchPointMm } {
  const base = createComponent(part.type).terminals.find((t) => t.label === label)
  const override = benchTerminalOverrides(part)[label]
  const tpl = base && override ? { ...base, ...override } : base
  const size = sizeOfMm(part.type, part.state)
  const o = part.orientation ?? { x: 0, y: 0, z: 0 }
  const euler = new THREE.Euler(THREE.MathUtils.degToRad(o.x), THREE.MathUtils.degToRad(o.y), THREE.MathUtils.degToRad(o.z), 'XYZ')
  const f = tpl?.position3D
  const local = f ? new THREE.Vector3((f.x - 0.5) * size.x, (f.y - 0.5) * size.y, (f.z - 0.5) * size.z) : new THREE.Vector3()
  const normal = new THREE.Vector3(...(FACE_NORMALS[String(tpl?.face ?? (f ? 'front' : 'bottom'))] ?? [0, -1, 0]))
  local.applyEuler(euler)
  normal.applyEuler(euler)
  return { p: { x: part.x + local.x, y: part.y + local.y, z: part.z + local.z }, n: { x: normal.x, y: normal.y, z: normal.z } }
}

const pt = (x: number, y: number, z: number): BenchPointMm => ({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, z: Math.round(z * 10) / 10 })

/** Remove pontos repetidos seguidos (troços de comprimento nulo). */
function clean(points: BenchPointMm[]): BenchPointMm[] {
  return points.filter((q, i) => i === 0 || Math.hypot(q.x - points[i - 1].x, q.y - points[i - 1].y, q.z - points[i - 1].z) > 0.5)
}

export function stampingBenchWiring(parts: BenchPlacement[], plateState?: Record<string, any>): BenchWireSpec[] {
  const byKey = new Map(parts.map((p) => [p.key, p]))
  const get = (key: string) => byKey.get(key)
  const plate = slotPlateDimsOf(plateState)
  const top = plate.thicknessMm / 2
  const wires: BenchWireSpec[] = []

  // ── 1. Alimentação 3G2,5 do QGD às tomadas ──────────────────────────────────────────────
  const riser = get('tray-riser-qgd')
  const neckQgd = get('tray-neck-qgd')
  const wallTray = get('tray-wall')
  if (riser && neckQgd && wallTray) {
    const riserLen = Number(riser.state?.lengthMm)
    const panelTop = riser.y - riserLen / 2
    const panelX = riser.x
    const riserFloorZ = riser.z - SIDE_H / 2 + R_FLOOR
    const trayFloorY = neckQgd.y - SIDE_H / 2 + R_FLOOR
    const wallZ = riser.z - SIDE_H / 2 - 10 // fundo da subida assente a 10 mm da parede
    const glandZ = wallZ + 125 // bucins no centro da profundidade do QGD (250 mm)
    const sock = SOCKET_DEVICES.socketFamatelSwitch
    // Bucim automático da tomada: no topo, a 45 % da caixa a partir das costas.
    const socketGland = (s: BenchPlacement) => ({ y: s.y + sock.height / 2, z: s.z - sock.depth / 2 + sock.caseDepth * 0.45 })

    const feed = (
      name: string, cableLabel: string, glandDx: number, aerialLaneDz: number,
      run: (dk: number, lx: number) => BenchPointMm[],
      socketKey: string, refs: { L: string; N: string; PE: [string, string] },
    ) => {
      const s = get(socketKey)
      if (!s) return
      const g = socketGland(s)
      const cores: Array<{ core: 'L' | 'N' | 'PE'; color: WireColor; kind: WireKind; from: BenchWireEnd }> = [
        { core: 'L', color: 'brown', kind: 'power', from: { ref: refs.L, label: '2' } },
        { core: 'N', color: 'blue', kind: 'neutral', from: { ref: refs.N, label: '2' } },
        { core: 'PE', color: 'green-yellow', kind: 'earth', from: { ref: refs.PE[0], label: refs.PE[1] } },
      ]
      cores.forEach(({ core, color, kind, from }, k) => {
        const dk = (k - 1) * 4
        const lx = panelX + glandDx + dk
        const pts = [
          // Dentro do QGD, por baixo do bucim superior; sai na vertical e recua para o fundo da subida.
          pt(lx, panelTop - 60, glandZ),
          pt(lx, panelTop + 30, glandZ),
          pt(lx, panelTop + 70, riserFloorZ),
          // Sobe pela subida até ao pescoço e segue no fundo do pescoço até à esteira aérea.
          pt(lx, trayFloorY, riserFloorZ),
          pt(lx, trayFloorY, wallTray.z + aerialLaneDz + dk),
          ...run(dk, lx),
          // Ponta da descida → folga de 20 mm → bucim superior da tomada → bornes.
          pt(s.x + dk * 0.6, g.y + 22, g.z),
          pt(s.x + dk * 0.6, g.y - 8, g.z),
        ]
        wires.push({
          id: `${name}-${core.toLowerCase()}`,
          number: `${refs.L === 'X1.3' ? 'XS-MAQ' : 'XS-COMP'}:${core}`,
          label: `${cableLabel} · ${core}`,
          from,
          to: { key: socketKey, label: core },
          color, gauge: '2.5mm²', kind,
          waypointsMm: clean(pts),
          bundleId: `chicote-${name}`,
        })
      })
    }

    // Maquete: esteira aérea (lado da nave) → ramal para a bancada → descida no pilar → tomada XS-MAQ.
    const toBench = get('tray-to-bench')
    const dropBench = get('tray-drop-bench')
    if (toBench && dropBench) {
      const dropFloorZ = dropBench.z - SIDE_H / 2 + R_FLOOR
      const dropBottom = dropBench.y - Number(dropBench.state?.lengthMm) / 2
      const laneX = toBench.x + 25
      feed('mq-3g25-maquete', '3G2,5 H07RN-F · QGD X1.3/X1.5 → TOMADA MAQUETE', 60, 45, (dk) => [
        pt(laneX + dk, trayFloorY, wallTray.z + 45 + dk),
        pt(laneX + dk, trayFloorY, dropFloorZ),
        pt(laneX + dk, dropBottom + 15, dropFloorZ),
      ], 'socket-bench', { L: 'X1.3', N: 'X1.5', PE: ['PE_BAR', 'PE6'] })
    }
    // Compressor: esteira aérea (lado da parede) → pescoço do compressor → descida na parede → XS-COMP.
    const neckComp = get('tray-neck-compressor')
    const dropComp = get('tray-drop-compressor')
    if (neckComp && dropComp) {
      const dropFloorZ = dropComp.z - SIDE_H / 2 + R_FLOOR
      const dropBottom = dropComp.y - Number(dropComp.state?.lengthMm) / 2
      const laneX = dropComp.x + 25
      feed('mq-3g25-compressor', '3G2,5 H07RN-F · QGD X1.6/X1.7 → TOMADA COMPRESSOR', -60, -55, (dk) => [
        pt(laneX + dk, trayFloorY, wallTray.z - 55 + dk),
        pt(laneX + dk, trayFloorY, dropFloorZ),
        pt(laneX + dk, dropBottom + 15, dropFloorZ),
      ], 'socket-compressor', { L: 'X1.6', N: 'X1.7', PE: ['PE_BAR', 'PE7'] })
    }
  }

  // ── 2. Cabos de campo até às réguas do QE1 ──────────────────────────────────────────────
  const cabinet = get('cabinet')
  const ductDrop = get('ductDrop')
  const ductUnder = get('ductUnder')
  const ductBottom = get('cabinet-duct-bottom')
  if (cabinet && ductDrop && ductUnder && ductBottom) {
    const L = plate.lengthMm, W = plate.widthMm
    const xl = -L / 2 + 17, xr = L / 2 - 17, zf = W / 2 - 17, zb = -W / 2 + 17
    const yDuct = top + 12
    const cabW = Number(cabinet.state?.widthMm) || 480
    const cabLeft = cabinet.x - cabW / 2
    const zDrop = ductDrop.z
    const yUnder = ductUnder.y
    const ductInZ = ductBottom.z

    /** Percurso pelas calhas perimetrais até ao canto da descida (lado esquerdo, junto à traseira). */
    const perimeterTo = (from: BenchPointMm, j: number, allowFront = true, prefer?: 'back'): BenchPointMm[] => {
      // Grelha de 7 × 7 pistas dentro da calha (34 × 42 mm): nenhum cabo fica sobreposto a outro.
      const dl = ((j % 7) - 3) * 3.2
      const y = yDuct + (Math.floor(j / 7) % 7) * 4.2
      const candidates = [
        { side: 'front', d: Math.abs(from.z - zf), p: pt(from.x, y, zf + dl) },
        { side: 'back', d: Math.abs(from.z - zb), p: pt(from.x, y, zb + dl) },
        { side: 'left', d: Math.abs(from.x - xl), p: pt(xl + dl, y, from.z) },
        { side: 'right', d: Math.abs(from.x - xr), p: pt(xr + dl, y, from.z) },
      ].filter((c) => (allowFront || c.side !== 'front') && (!prefer || c.side === prefer)).sort((a, b) => a.d - b.d)
      const entry = candidates[0]
      const out: BenchPointMm[] = [entry.p]
      if (entry.side === 'front') out.push(pt(xl + dl, y, zf + dl))
      if (entry.side === 'right') out.push(pt(xr + dl, y, zb + dl), pt(xl + dl, y, zb + dl))
      if (entry.side === 'back') out.push(pt(xl + dl, y, zb + dl))
      out.push(pt(xl + dl, y, zDrop + dl))
      return out
    }

    const ductMid = get('cabinet-duct-mid')
    const ductTop = get('cabinet-duct-top')
    const railTop = (term: BenchPlacement) => term.y + 33 // borne PTI 6 com 66 mm de altura
    const railBottom = (term: BenchPlacement) => term.y - 33
    /** Dentro do QE1: do bucim lateral até ao borne `2` (calha B pela calha inferior; calha A pela intermédia). */
    const insideTo = (term: BenchPlacement, lane: number): BenchPointMm[] => {
      const rail = BENCH_TERMINAL_STRIPS.find((st) => term.key.startsWith(`terminals-${st.strip}-`))?.rail ?? 'B'
      const z = ductInZ + lane * 0.5
      if (rail === 'A' && ductMid) {
        return [
          pt(cabLeft + 14 + lane * 0.3, yUnder, z),
          pt(cabLeft + 14 + lane * 0.3, ductMid.y + lane * 0.4, z),
          pt(term.x, ductMid.y + lane * 0.4, z),
          pt(term.x, railBottom(term) - 14, ductInZ),
        ]
      }
      return [
        pt(cabLeft + 30, ductBottom.y + lane * 0.4, z),
        pt(term.x, ductBottom.y + lane * 0.4, z),
        pt(term.x, railBottom(term) - 14, ductInZ),
      ]
    }

    let j = 0
    /** Cabo de campo: aparelho → calhas da base → perna → bucim do QE1 → borne. */
    const fieldWire = (id: string, number: string, label: string, src: { key: string; label: string }, term: BenchPlacement,
      color: WireColor, kind: WireKind, toEnd?: 'ferruleDouble') => {
      const part = get(src.key)
      if (!part) return
      const { p, n } = benchTerminalPointMm(part, src.label)
      const exit = pt(p.x + n.x * 14, p.y + n.y * 14, p.z + n.z * 14)
      // Botões: descem por dentro da caixa e saem pelo fundo (a caixa está 42 mm acima da base).
      // CPV10 e coluna: descem rente à base, junto ao módulo elétrico, e seguem para a calha traseira.
      const isOperator = part.key.startsWith('operator-')
      const lowRun = part.key === 'valveTerminal' || part.key === 'signalTower'
      const travelY = isOperator ? top + 24 : lowRun ? top + 8 : Math.max(exit.y, top + 48)
      // A calha frontal fica para a caixa de botões; sensores e válvulas descem para a traseira/laterais.
      const path = perimeterTo(exit, j, isOperator, lowRun ? 'back' : undefined)
      const first = path[0]
      const lane = ((j % 7) - 3) * 2.6
      wires.push({
        id, number, label, from: src, to: { key: term.key, label: '2' }, color, gauge: '0.75mm²', kind,
        ...(toEnd ? { toEnd } : {}),
        waypointsMm: clean([
          exit,
          pt(exit.x, travelY, exit.z),
          pt(first.x, travelY, first.z),
          ...path,
          // Sai por cima da borda esquerda da base, desce por fora e entra na calha da perna por baixo do tampo.
          pt(-L / 2 - 14 + lane * 0.3, path[path.length - 1].y, zDrop + lane),
          pt(-L / 2 - 14 + lane * 0.3, -top - 24, zDrop + lane),
          pt(ductDrop.x + lane * 0.5, -top - 24, zDrop + lane),
          pt(ductDrop.x + lane * 0.5, yUnder + lane * 0.4, zDrop + lane),
          pt(cabLeft - 18, yUnder + lane * 0.4, zDrop + lane * 0.5),
          pt(cabLeft + 8, yUnder, zDrop),
          ...insideTo(term, lane),
        ]),
      })
      j += 1
    }

    // Entradas, saídas, motor e reservas (X21…X24), pela ordem das réguas.
    for (const { strip, points } of BENCH_TERMINAL_STRIPS) {
      if (strip === 'X25' || strip === 'X26') continue
      points.forEach(({ marker, tag }, i) => {
        const src = BENCH_FIELD_SOURCES[tag]
        const term = get(`terminals-${strip}-${i + 1}`)
        if (!src || !term) return
        fieldWire(`mq-campo-${strip.toLowerCase()}-${i + 1}`, `${strip}.${i + 1}`,
          `${marker} ${tag} · ${get(src.key)?.state?.labelText ?? src.key} → ${strip}.${i + 1}`,
          src, term, STRIP_COLORS[strip] ?? 'black', strip === 'X21' ? 'signal' : 'control')
      })
    }

    // Alimentação dos sensores e atuadores: dois condutores (ponteira dupla) no borne `2` de X25 / X26.
    const supplyCount = { '+24V': 0, '0V': 0 }
    for (const load of BENCH_SUPPLY_LOADS) {
      const idx = supplyCount[load.rail]++
      const strip = load.rail === '+24V' ? 'X25' : 'X26'
      const term = get(`terminals-${strip}-${Math.floor(idx / 2) + 1}`)
      if (!term) continue
      fieldWire(`mq-campo-${strip.toLowerCase()}-${load.key}-${load.label.replace(/[^A-Za-z0-9]/g, '')}`,
        `${strip}.${Math.floor(idx / 2) + 1}`, `${load.rail} · ${get(load.key)?.state?.labelText ?? load.key} ${load.label} → ${strip}.${Math.floor(idx / 2) + 1}`,
        { key: load.key, label: load.label }, term, load.rail === '+24V' ? 'brown' : 'blue', 'control', 'ferruleDouble')
    }

    // Distribuição: X20 alimenta X25.1 / X26.1 pela calha do topo; pontes entre bornes vizinhos por cima.
    const x20 = get('terminals-x20')
    for (const [strip, out] of [['X25', '+24V-OUT'], ['X26', '0V-OUT']] as const) {
      const count = BENCH_TERMINAL_STRIPS.find((st) => st.strip === strip)?.points.length ?? 0
      const firstTerm = get(`terminals-${strip}-1`)
      if (x20 && firstTerm && ductTop) {
        const z = ductInZ + (strip === 'X25' ? -3 : 3)
        wires.push({
          id: `mq-campo-x20-${strip.toLowerCase()}`, number: `X20 → ${strip}.1`, label: `${out === '+24V-OUT' ? '+24 V' : '0 V'} · X20 → ${strip}.1`,
          from: { key: 'terminals-x20', label: out }, to: { key: firstTerm.key, label: '1' },
          color: strip === 'X25' ? 'brown' : 'blue', gauge: '1.5mm²', kind: 'control',
          toEnd: 'ferruleDouble',
          waypointsMm: clean([
            pt(x20.x, railBottom(x20) - 14, ductInZ),
            pt(x20.x, ductBottom.y, z),
            pt(cabLeft + 14, ductBottom.y, z),
            pt(cabLeft + 14, ductTop.y, z),
            pt(firstTerm.x, ductTop.y, z),
            pt(firstTerm.x, railTop(firstTerm) + 14, ductInZ),
          ]),
        })
      }
      for (let k = 1; k < count; k += 1) {
        const a = get(`terminals-${strip}-${k}`), b = get(`terminals-${strip}-${k + 1}`)
        if (!a || !b) continue
        const y = railTop(a) + 10
        wires.push({
          id: `mq-campo-ponte-${strip.toLowerCase()}-${k}`, number: `${strip}.${k}–${k + 1}`, label: `Ponte ${strip}.${k} → ${strip}.${k + 1}`,
          from: { key: a.key, label: '1' }, to: { key: b.key, label: '1' },
          color: strip === 'X25' ? 'brown' : 'blue', gauge: '1.5mm²', kind: 'control',
          fromEnd: 'ferruleDouble', toEnd: 'ferruleDouble',
          waypointsMm: [pt(a.x, y, ductInZ), pt(b.x, y, ductInZ)],
        })
      }
    }

    // Comum dos botões (+24 V de X25 em S1.21) e pontes entre operadores dentro da caixa.
    const chain: Array<[string, string]> = [
      ['operator-emergency', '21'], ['operator-mode', '13'], ['operator-reset', '3'],
      ['operator-cycle', '13'], ['operator-stop', '1'], ['operator-start', '3'],
    ]
    for (let k = 1; k < chain.length; k += 1) {
      const [aKey, aLabel] = chain[k - 1]
      const [bKey, bLabel] = chain[k]
      if (!get(aKey) || !get(bKey)) continue
      const ta = benchTerminalPointMm(get(aKey)!, aLabel)
      const tb = benchTerminalPointMm(get(bKey)!, bLabel)
      // Por trás dos blocos de contactos, dentro da caixa: recua 10 mm e passa de um ao outro.
      const back = Math.min(ta.p.z, tb.p.z) - 10
      wires.push({
        id: `mq-campo-ponte-${k}`,
        number: 'COM+24V',
        label: `Ponte +24 V · ${aKey.replace('operator-', '')} → ${bKey.replace('operator-', '')}`,
        from: { key: aKey, label: aLabel },
        to: { key: bKey, label: bLabel },
        color: 'brown', gauge: '0.75mm²', kind: 'control',
        // Em «L» por trás dos operadores: primeiro na horizontal, depois na vertical.
        waypointsMm: clean([pt(ta.p.x, ta.p.y, back), pt(tb.p.x, ta.p.y, back), pt(tb.p.x, tb.p.y, back)]),
      })
    }
  }
  return wires
}
