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
  /** Tubo (ar comprimido / hidráulica) em vez de condutor elétrico. */
  medium?: 'pneumatic' | 'hydraulic'
  /** Pressão nominal do tubo (bar), só para tubos. */
  pressureBar?: number
  /** Cabo revestido (bainha exterior): os condutores são desenhados dentro de uma capa, como no
   *  H07RN-F que alimenta a tomada — não três fios nus lado a lado. */
  sheathed?: boolean
  /** Cor da bainha exterior. */
  sheathColor?: string
  /** Nº de condutores do cabo (3 = L+N+PE). */
  conductorCount?: number
}

/**
 * Endereço do guião 1185 → peça e borne do aparelho de campo.
 *
 * As chaves são os endereços que estão no borne do módulo e na régua X21/X22 (I0.0…I1.7,
 * Q4.0…Q5.6), tal como no GRAFCET. `undefined` = ligação interna ao QE1 (ponte na régua), sem
 * cabo de campo: é o caso das entradas e saídas que o guião não usa.
 */
export const BENCH_FIELD_SOURCES: Record<string, { key: string; label: string } | undefined> = {
  // ── Entradas digitais (X21) ────────────────────────────────────────────────
  C1_Recuado: { key: 'feeder', label: 'REC' },
  C1_Avancado: { key: 'feeder', label: 'AVA' },
  C3_Avancado: { key: 'drawerCylinder', label: 'AVA' },
  C3_Recuado: { key: 'drawerCylinder', label: 'REC' },
  C4_Recuado: { key: 'press', label: 'SUP' },
  C4_Avancado: { key: 'press', label: 'INF' },
  Sensor_Cor: { key: 'opticalSensor', label: 'OUT' },
  FC_Estampagem: { key: 'fc2', label: 'NO' },
  FC_Alimentador: { key: 'fc1', label: 'NO' },
  Sensor_Metal: { key: 'inductiveSensor', label: 'OUT' },
  C2_Avancado: { key: 'arm', label: 'B6' },
  C2_Recuado: { key: 'arm', label: 'B7' },
  B_Start: { key: 'operator-start', label: '4' },
  B_Stop: { key: 'operator-stop', label: '2' },
  Sel_Auto: { key: 'operator-mode', label: '14' },
  // I1.7 lê o contacto de segurança KS1 (13/14) — o cabo vai da régua ao relé, dentro do QE1.
  Seguranca_OK: { key: 'safetyRelay', label: '14' },
  // ── Saídas digitais (X22) — bobinas Y1…Y9 do CPV10, relés K1/K2 e coluna luminosa ──
  // Bobinas do CPV10 por FUNÇÃO (o guião numera Y1–Y9 num terminal diferente; o CPV10 da
  // maquete tem Y0…Y6 + VON/VOFF, e é este o aparelho que está montado na bancada).
  Cil1_Avanc: { key: 'valveTerminal', label: 'Y0' },
  Cil1_Recuo: { key: 'valveTerminal', label: 'Y1' },
  Cil2_Recuo: { key: 'valveTerminal', label: 'Y2' },
  Cil2_Avanc: { key: 'valveTerminal', label: 'Y3' },
  Cil3_Recuo: { key: 'valveTerminal', label: 'Y5' },
  Cil3_Avanc: { key: 'valveTerminal', label: 'Y4' },
  Cil4_Estampa: { key: 'valveTerminal', label: 'Y6' },
  Ventosa_On: { key: 'valveTerminal', label: 'VON' },
  Ventosa_Off: { key: 'valveTerminal', label: 'VOFF' },
  K1_M1_Esq: { key: 'relay-1', label: 'A1' },
  K2_M1_Dir: { key: 'relay-2', label: 'A1' },
  LED_Amarelo: { key: 'signalTower', label: 'Y' },
  LED_Verde: { key: 'signalTower', label: 'G' },
  LED_Vermelho: { key: 'signalTower', label: 'R' },
  // ── Motor M1 e reservas (X23 / X24) ───────────────────────────────────────
  'M1 +': { key: 'motor', label: 'CW' },
  'M1 -': { key: 'motor', label: 'CCW' },
  'ENC A': { key: 'motor', label: 'A' },
  'ENC B': { key: 'motor', label: 'B' },
  'S6 rearme': { key: 'operator-reset', label: '4' },
  reserva: undefined,
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
      // Condutores do tronco comum: sobem DENTRO da subida do QGD (eixo x = riser.x, z = riser.z),
      // atravessam no fundo do pescoço e entram na esteira aérea. Fora da subida só a ponta.
      const riserAxisX = riser.x
      const riserAxisZ = riser.z
      const cores: Array<{ core: 'L' | 'N' | 'PE'; color: WireColor; kind: WireKind; from: BenchWireEnd }> = [
        { core: 'L', color: 'brown', kind: 'power', from: { ref: refs.L, label: '2' } },
        { core: 'N', color: 'blue', kind: 'neutral', from: { ref: refs.N, label: '2' } },
        { core: 'PE', color: 'green-yellow', kind: 'earth', from: { ref: refs.PE[0], label: refs.PE[1] } },
      ]
      cores.forEach(({ core, color, kind, from }, k) => {
        const dk = (k - 1) * 4
        // O bucim de saída do QGD é o TOPO da subida: os condutores têm de sair na vertical dela,
        // senão o cabo aparece a atravessar o ar entre o quadro e a esteira.
        const lx = riserAxisX + dk * 1.5
        // Pista dentro da subida (200 mm de largura): os três condutores separados, nunca sobrepostos.
        const laneX = riserAxisX + dk * 1.5
        const pts = [
          // O troço DENTRO do QGD (borne → calha → bucim) é desenhado pelo `wallPanelExitRoute`
          // no store, a partir deste primeiro ponto: por isso aqui só se dá o bucim.
          pt(lx, panelTop - 40, glandZ),
          // Do bucim para dentro da subida e sobe por ela.
          pt(lx, panelTop + 20, glandZ),
          pt(laneX, panelTop + 60, riserAxisZ),
          pt(laneX, trayFloorY, riserAxisZ),
          pt(laneX, trayFloorY, wallTray.z + aerialLaneDz + dk),
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
          // 3G2,5 H07RN-F é um CABO: os três condutores vão dentro de uma bainha preta, não
          // soltos. A bainha é a mesma nos três (mesmo bundle) e o 3D desenha-a por cima.
          sheathed: true, sheathColor: '#1c1917', conductorCount: 3,
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
    const ductMidBC = get('cabinet-duct-midBC')
    const ductTop = get('cabinet-duct-top')
    // Ilha S7-300 (fila C) e fonte/segurança (fila A) — ver `stampingBench.ts`.
    const plcDi = get('cabinet-plc-di')
    const plcDo = get('cabinet-plc-do')
    const plcCpu = get('cabinet-plc-cpu')
    const psu = get('psu24')
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
      // CPV10 e coluna: descem rente à base, junto ao módulo elétrico, e entram na calha traseira
      // à cota do eixo dela (top + 12), sem passar por cima da boca da calha.
      const isOperator = part.key.startsWith('operator-')
      const lowRun = part.key === 'valveTerminal' || part.key === 'signalTower'
      // Cota da perna de saída: os botões descem por dentro da caixa; os aparelhos da bancada descem
      // por baixo da base (y < 0) e só à cota da calha entram nela — nunca à altura do borne, senão
      // o cabo atravessa tudo o que estiver entre o borne e a calha.
      // Os aparelhos assentam na base: para não os atravessar, o cabo desce ABAIXO do tampo
      // (y = top − 120) e corre nessa cota até ao eixo da calha vertical, subindo aí à boca da
      // calha. É o que acontece na bancada real: o cabo sai do aparelho, desce e entra na calha.
      const travelY = isOperator ? top + 24 : top - 120
      // A calha frontal fica para a caixa de botões; sensores e válvulas descem para a traseira/laterais.
      const path = perimeterTo(exit, j, isOperator, lowRun ? 'back' : undefined)
      const first = path[0]
      const lane = ((j % 7) - 3) * 2.6
      // A peça (cilindro, prensa, sensor…) tem corpo: o cabo não pode descer colado ao borne pela
      // vertical da peça, senão atravessa-a. Desce ao lado, fora da largura da peça, e só depois
      // entra na calha. `clearX`/`clearZ` afastam a perna da caixa do aparelho.
      const sz = sizeOfMm(part.type, part.state)
      // A perna de saída sai SEMPRE para baixo do aparelho (abaixo da base, y < 0) e só à cota da
      // calha é que entra nela. É o caminho que um electricista usa: desce pelo lado da peça, nunca
      // a atravessa nem passa por cima dela.
      // A perna de saída vai para a BORDA da bancada mais próxima (onde estão as calhas), não para
      // o lado da peça: assim o cabo desce fora de todos os aparelhos, no corredor perimetral.
      const edge = plate.lengthMm / 2 - 34
      const clearX = Math.max(-edge, Math.min(edge, exit.x + (exit.x >= part.x ? 1 : -1) * (sz.x / 2 + 14)))
      const clearZ = Math.max(-edge, Math.min(edge, exit.z + (exit.z >= part.z ? 1 : -1) * (sz.z / 2 + 14)))
      wires.push({
        id, number, label, from: src, to: { key: term.key, label: '2' }, color, gauge: '0.75mm²', kind,
        ...(toEnd ? { toEnd } : {}),
        // Chicote de campo: filaçado nas calhas perimetrais → perna → bucim QE1.
        bundleId: isOperator ? 'mq-campo-operadores' : 'mq-campo',
        waypointsMm: clean([
          exit,
          // Sai do borne PARA FORA do aparelho, desce ao lado dele até à cota da calha e só então
          // corre para o eixo da calha: nunca corta pelo ar em diagonal nem atravessa a peça.
          pt(clearX, exit.y, exit.z),
          pt(clearX, travelY, exit.z),
          pt(clearX, travelY, clearZ),
          pt(first.x, travelY, clearZ),
          pt(first.x, travelY, first.z),
          ...path,
          // Sai por cima da borda esquerda da base, desce por fora e entra na calha da perna por baixo do tampo.
          pt(-L / 2 - 14 + lane * 0.3, path[path.length - 1].y, zDrop + lane),
          pt(-L / 2 - 14 + lane * 0.3, -top - 24, zDrop + lane),
          pt(ductDrop.x + lane * 0.5, -top - 24, zDrop + lane),
          pt(ductDrop.x + lane * 0.5, yUnder + lane * 0.4, zDrop + lane),
          pt(cabLeft - 18, yUnder + lane * 0.4, zDrop + lane * 0.5),
          // Entrada pelo bucim lateral do QE1 → calha técnica interior.
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
        // `undefined` = borne de reserva (o guião não o usa): fica na régua sem cabo de campo.
        const src = BENCH_FIELD_SOURCES[tag]
        const term = get(`terminals-${strip}-${i + 1}`)
        if (!src || !term) return
        fieldWire(`mq-campo-${strip.toLowerCase()}-${i + 1}`, `${strip}.${i + 1}`,
          `${marker} ${tag} · ${get(src.key)?.state?.labelText ?? src.key} → ${strip}.${i + 1}`,
          src, term, STRIP_COLORS[strip] ?? 'black', strip === 'X21' ? 'signal' : 'control')
      })
    }

    // ── 2b. Interior do QE1: borne de régua → borne do módulo do PLC ──────────────────────
    // É este troço que faltava: os cabos de campo chegavam às réguas X21/X22 e aí paravam, e a
    // ilha S7-300 ficava sem ligação. Aqui cada endereço do guião desce da régua pela calha entre
    // a fila B e a fila C até ao front connector do SM321 (I0.0…I1.7) / SM322 (Q4.0…Q5.6).
    {
      const ductBC = ductMidBC ?? ductBottom
      const rowOf = (strip: 'X21' | 'X22') => BENCH_TERMINAL_STRIPS.find((st) => st.strip === strip)?.points ?? []
      /** Borne do módulo (o front connector fica na face da frente do corpo do S7-300). */
      const moduleTerminal = (mod: BenchPlacement, label: string): BenchPointMm | null => {
        const tpl = createComponent(mod.type).terminals.find((t) => t.label === label)
        if (!tpl?.position3D) return null
        const w = Number(COMPONENT_PHYSICAL_SIZE_MM[mod.type]?.width ?? 40)
        const h = Number(COMPONENT_PHYSICAL_SIZE_MM[mod.type]?.height ?? 125)
        const d = Number(COMPONENT_PHYSICAL_SIZE_MM[mod.type]?.depth ?? 120)
        return pt(mod.x + (tpl.position3D.x - 0.5) * w, mod.y + (tpl.position3D.y - 0.5) * h, mod.z + d / 2 + 4)
      }
      const link = (id: string, address: string, strip: 'X21' | 'X22', index: number, mod: BenchPlacement | undefined, color: WireColor, lane: number) => {
        if (!mod) return
        const term = get(`terminals-${strip}-${index}`)
        if (!term) return
        const target = moduleTerminal(mod, address)
        if (!target) return
        const z = ductInZ + lane * 0.5
        wires.push({
          id, number: `${strip}.${index} → ${address}`, label: `${address} · ${strip}.${index} → ${mod.state?.labelText ?? address}`,
          from: { key: term.key, label: '2' }, to: { key: mod.key, label: address },
          color, gauge: '0.75mm²', kind: 'signal',
          bundleId: `qe1-${strip.toLowerCase()}`,
          waypointsMm: clean([
            pt(term.x, railBottom(term) - 12, ductInZ),
            pt(term.x, ductBC.y + 8 + lane * 0.4, z),
            pt(target.x + lane * 0.4, ductBC.y + 8 + lane * 0.4, z),
            pt(target.x + lane * 0.4, target.y + 22, z),
            target,
          ]),
        })
      }
      rowOf('X21').forEach(({ marker }, i) => link(`qe1-di-${marker.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        marker, 'X21', i + 1, plcDi, i % 2 ? 'grey' : 'black', ((i % 9) - 4) * 2.2))
      rowOf('X22').forEach(({ marker }, i) => link(`qe1-do-${marker.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        marker, 'X22', i + 1, plcDo, 'violet', ((i % 9) - 4) * 2.2))

      // Alimentação dos módulos: +24 V (X20 `+24V-OUT`) e 0 V (X20 `0V-OUT`) para L+ / M de cada um.
      const x20 = get('terminals-x20')
      if (x20) {
        for (const mod of [plcCpu, plcDi, plcDo, get('cabinet-plc-ai')]) {
          if (!mod) continue
          for (const [label, color, rail] of [['L+', 'brown', 1], ['M', 'blue', -1]] as const) {
            const target = moduleTerminal(mod, label)
            if (!target) continue
            const z = ductInZ + rail * 1.2
            wires.push({
              id: `qe1-supply-${mod.key}-${label.replace('+', 'p')}`,
              number: `X20 → ${label}`,
              label: `${label === 'L+' ? '+24 V' : '0 V'} · X20 → ${mod.state?.labelText ?? mod.type} ${label}`,
              from: { key: x20.key, label: label === 'L+' ? '+24V-OUT' : '0V-OUT' },
              to: { key: mod.key, label },
              color, gauge: '1.5mm²', kind: label === 'L+' ? 'power' : 'neutral',
              bundleId: 'qe1-alimentacao-plc',
              waypointsMm: clean([
                pt(x20.x, railBottom(x20) - 12, ductInZ),
                pt(x20.x, ductBC.y + 10, z),
                pt(target.x, ductBC.y + 10, z),
                pt(target.x, target.y + 24, z),
                target,
              ]),
            })
          }
        }
      }

      // Laço de segurança: +24 V no A1/A2 do KS1 e o contacto NF (13/14) livre para I1.7 Seguranca_OK.
      const safety = get('safetyRelay')
      if (safety && x20) {
        const a1 = moduleTerminal(safety, 'A1')
        const s11 = moduleTerminal(safety, 'S11')
        const c13 = moduleTerminal(safety, '13')
        if (a1 && s11 && c13) {
          const z = ductInZ + 4
          wires.push({
            id: 'qe1-seguranca-a1', number: 'X20 → KS1.A1', label: '+24 V · X20 → KS1 A1 (alimentação do relé de segurança)',
            from: { key: x20.key, label: '+24V-OUT' }, to: { key: safety.key, label: 'A1' },
            color: 'brown', gauge: '0.75mm²', kind: 'power', bundleId: 'qe1-seguranca',
            waypointsMm: clean([pt(x20.x, railBottom(x20) - 12, ductInZ), pt(x20.x, ductBC.y + 10, z), pt(a1.x, ductBC.y + 10, z), pt(a1.x, a1.y - 14, z), a1]),
          })
          // S11–S12: cadeia de Emergência vinda do pupitre (X24 `S6 rearme` e a seta de emergência).
          const emergency = get('operator-emergency')
          const emTerm = get('terminals-x24-1')
          if (emTerm) {
            wires.push({
              id: 'qe1-seguranca-s11', number: 'X24.1 → KS1.S11', label: 'Emergência · X24.1 → KS1 S11',
              from: { key: emTerm.key, label: '2' }, to: { key: safety.key, label: 'S11' },
              color: 'grey', gauge: '0.75mm²', kind: 'control', bundleId: 'qe1-seguranca',
              waypointsMm: clean([pt(emTerm.x, railBottom(emTerm) - 12, ductInZ), pt(emTerm.x, ductBC.y + 10, ductInZ), pt(s11.x, ductBC.y + 10, ductInZ), pt(s11.x, s11.y + 16, ductInZ), s11]),
            })
          }
          // 13/14: contacto NF que fecha quando o relé está rearmado → X21.16 (I1.7 Seguranca_OK).
          const i17 = get('terminals-X21-16')
          if (i17) {
            wires.push({
              id: 'qe1-seguranca-13', number: 'KS1.13 → X21.16', label: 'Seguranca_OK · KS1 13 → X21.16 (I1.7)',
              from: { key: safety.key, label: '13' }, to: { key: i17.key, label: '1' },
              color: 'black', gauge: '0.75mm²', kind: 'signal', bundleId: 'qe1-seguranca',
              waypointsMm: clean([pt(c13.x, c13.y + 12, ductInZ), pt(c13.x, ductBC.y + 8, ductInZ), pt(i17.x, ductBC.y + 8, ductInZ), pt(i17.x, railBottom(i17) - 12, ductInZ)]),
            })
          }
          void emergency
        }
      }
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

    // ── OPERADORES DE CAMPO → QE1 ────────────────────────────────────────────────────────────
    // Os botões da bancada (emergência, modo, rearme, ciclo, stop, start) estavam todos MUDOS: só
    // a emergência tinha o 21 alimentado e nenhum contacto ia ao PLC. Aqui fecham-se as cadeias:
    //  · Segurança: +24 V → EMERG 21/22 → S2 13/14?? Não: EMERG 22 → KS1 S11/S12 → KS1 A1/A2.
    //  · Sinais: cada contacto vai a uma entrada de X21 e o retorno comum (0 V) fecha o circuito.
    const fieldOp = (
      id: string, number: string, label: string,
      from: { key: string; label: string }, to: { key: string; label: string },
      color: WireColor, kind: WireKind, j: number,
    ) => {
      const a = get(from.key), b = get(to.key)
      if (!a || !b) return
      const pa = benchTerminalPointMm(a, from.label)
      const exit = pt(pa.p.x + pa.n.x * 14, pa.p.y + pa.n.y * 14, pa.p.z + pa.n.z * 14)
      const path = perimeterTo(exit, j, false)
      const lane = ((j % 7) - 3) * 2.6
      wires.push({
        id, number, label, from, to, color, gauge: '0.75mm²', kind,
        waypointsMm: clean([
          exit,
          pt(exit.x, top + 30, exit.z),
          pt(path[0].x, top + 30, path[0].z),
          ...path,
          pt(-plate.lengthMm / 2 - 14 + lane * 0.3, -top - 24, zDrop + lane),
          pt(ductDrop.x + lane * 0.5, -top - 24, zDrop + lane),
          pt(ductDrop.x + lane * 0.5, yUnder + lane * 0.4, zDrop + lane),
          pt(cabLeft - 18, yUnder + lane * 0.4, zDrop + lane * 0.5),
          pt(cabLeft + 8, yUnder, zDrop),
          ...insideTo(b, lane),
        ]),
      })
    }
    {
      const em = get('operator-emergency')
      const ks1 = get('safetyRelay')
      if (em && ks1) {
        // Emergência: +24 V entra no 21 (já vem do X25.7) e sai no 22 para o laço do KS1.
        // A emergência é 1 NF: o 22 vai ao S11 e o S12 tem de fechar para o S52 (ponte do canal 2);
        // sem essa ponte o relé de segurança fica em falha e os contactos 13/14 nunca fecham.
        fieldOp('op-emerg-s11', 'S1:22 → KS1:S11', 'SEGURANÇA · EMERGÊNCIA 22 → KS1 S11 (canal 1)',
          { key: 'operator-emergency', label: '22' }, { key: 'safetyRelay', label: 'S11' }, 'brown', 'control', 1)
        fieldOp('op-emerg-s12', 'KS1:S12 → KS1:S52', 'SEGURANÇA · ponte S12 → S52 (entrada do canal 2)',
          { key: 'safetyRelay', label: 'S12' }, { key: 'safetyRelay', label: 'S52' }, 'brown', 'control', 2)
        fieldOp('op-emerg-a2', 'KS1:A2 → X26', 'SEGURANÇA · KS1 A2 → 0 V (X26)',
          { key: 'safetyRelay', label: 'A2' }, { key: 'terminals-X26-2', label: '2' }, 'blue', 'neutral', 3)
        // Contacto de sinalização 23/24 → entrada I1.6 já está no 13/14; fecha-se o 23/24 como reserva.
      }
      // Botões de comando → entradas digitais livres (X21.11…X21.14) e retorno comum a 0 V.
      // O MAN/AUTO já vai ao X21.15 pelo mapeamento do guião (não duplicar a entrada).
      const SIGNALS: Array<[string, string, number]> = [
        ['operator-reset', '4', 1],   // REARME     → X21.11 (I1.0)
        ['operator-cycle', '14', 2],  // CICLO      → X21.12 (I1.1)
        ['operator-stop', '2', 3],    // STOP (NF)  → X21.13 (I1.2)
        ['operator-start', '2', 4],   // START      → X21.14 (I1.3)
      ]
      for (const [key, pin, idx] of SIGNALS) {
        const part = get(key)
        const term = get(`terminals-X21-${10 + idx}`)
        if (!part || !term) continue
        const ref = part.state?.labelText ?? key.replace('operator-', '').toUpperCase()
        fieldOp(`op-sig-${key.replace('operator-', '')}`, `${ref}:${pin} → X21.${10 + idx}`,
          `COMANDO · ${ref} ${pin} → X21.${10 + idx} (I${idx === 4 ? '1.3' : `1.${idx - 1}`})`,
          { key, label: pin }, { key: term.key, label: '2' }, 'black', 'signal', 4 + idx)
      }
    }

    // ── COMPRESSOR: tomada XS-COMP ← ficha CEE ← cabo 3G2,5 revestido (arrastável) → motor ─
    // Contacto ficha↔tomada (curto) + cabo flexível revestido da ficha aos bornes L/N do compressor.
    const cmpSock = get('socket-compressor')
    const cmpPlug = get('plug-compressor')
    const cmpPart = get('compressor')
    if (cmpSock && cmpPlug && cmpPart) {
      const s2 = cmpSock
      const plug = cmpPlug
      // Contacto de encaixe: tomadas OUT.* → bornes da ficha (simula pinos encaixados).
      for (const [sockLab, plugLab, color, kind] of [
        ['OUT.L', 'L', 'brown', 'power'],
        ['OUT.N', 'N', 'blue', 'neutral'],
        ['OUT.PE', 'PE', 'green-yellow', 'earth'],
      ] as const) {
        wires.push({
          id: `mq-comp-contact-${plugLab.toLowerCase()}`,
          number: `XS-COMP↔F-COMP:${plugLab}`,
          label: `Contacto CEE · XS-COMP ${sockLab} → F-COMP ${plugLab}`,
          from: { key: 'socket-compressor', label: sockLab },
          to: { key: 'plug-compressor', label: plugLab },
          color, gauge: '2.5mm²', kind,
          waypointsMm: clean([
            pt(s2.x, s2.y, s2.z + 20),
            pt(plug.x, plug.y, plug.z - 10),
          ]),
        })
      }
      // Cabo revestido 3G2,5: sai pelo bucim traseiro da ficha, desce organizado e entra no compressor.
      // Editável / arrastável (sem locked). Condutores L/N no mesmo chicote filaçado.
      const cmpSize = sizeOfMm('airCompressor', cmpPart.state)
      const cmpFrontZ = cmpPart.z + cmpSize.z / 2 + 18
      const glandExit = pt(plug.x, plug.y - 8, plug.z + 42) // saída pelo bucim da ficha
      const dropLane = plug.y - 55
      for (const [label, color, kind, dx] of [
        ['L', 'brown', 'power', -3],
        ['N', 'blue', 'neutral', 3],
      ] as const) {
        wires.push({
          id: `mq-comp-cord-${label.toLowerCase()}`,
          number: `F-COMP:${label}`,
          label: `3G2,5 H07RN-F revestido · FICHA COMPRESSOR → MOTOR ${label}`,
          from: { key: 'plug-compressor', label },
          to: { key: 'compressor', label },
          color, gauge: '2.5mm²', kind,
          sheathed: true, sheathColor: '#1c1917', conductorCount: 3,
          bundleId: 'chicote-ficha-comp',
          waypointsMm: clean([
            glandExit,
            pt(plug.x + dx, dropLane, plug.z + 55),
            pt(cmpPart.x + dx, dropLane, cmpFrontZ),
            pt(cmpPart.x + dx, cmpPart.y + cmpSize.y / 2 + 12, cmpFrontZ),
            pt(cmpPart.x + dx * 0.5, cmpPart.y + cmpSize.y / 2 + 12, cmpPart.z + 40),
          ]),
        })
      }
    }

    // ── AR COMPRIMIDO ────────────────────────────────────────────────────────────────────────
    // Compressor (parede) → unidade de tratamento FRL (pé da bancada) → terminal CPV10 →
    // cilindros. Sem estes tubos a maquete não tinha um único condutor pneumático: as válvulas
    // não recebiam ar e os cilindros não se moviam.
    const airTube = (
      id: string, number: string, label: string,
      a: { key: string; label: string }, b: { key: string; label: string },
      waypointsMm: BenchPointMm[], diameterMm = 8,
    ) => {
      const pa = get(a.key), pb = get(b.key)
      if (!pa || !pb) return
      const exit = benchTerminalPointMm(pa, a.label)
      const enter = benchTerminalPointMm(pb, b.label)
      wires.push({
        id, number, label,
        from: a, to: b,
        color: 'blue', gauge: `${diameterMm}`, kind: 'pneumatic',
        medium: 'pneumatic', pressureBar: 6,
        bundleId: 'ar-comprimido',
        waypointsMm: clean([
          pt(exit.p.x + exit.n.x * 12, exit.p.y + exit.n.y * 12, exit.p.z + exit.n.z * 12),
          ...waypointsMm,
          pt(enter.p.x + enter.n.x * 12, enter.p.y + enter.n.y * 12, enter.p.z + enter.n.z * 12),
        ]),
      })
    }

    // 1. Compressor → FRL. O compressor está na parede, atrás e à esquerda; o FRL no pé da bancada.
    // Sobe à cota da esteira aérea, atravessa no fundo dela e desce até à entrada do FRL.
    const cmp = get('compressor'), frlPart = get('airTreatment')
    const cmpDrop = get('tray-drop-compressor')
    const benchDrop = get('tray-drop-bench')
    if (cmp && frlPart) {
      const out = benchTerminalPointMm(cmp, 'OUT')
      const inn = benchTerminalPointMm(frlPart, 'IN')
      const wallTrayP = get('tray-wall')
      const laneY = wallTrayP ? wallTrayP.y - 18 : out.p.y + 200
      // O tubo sobe pela descida do compressor (mesmo eixo X da esteira vertical), segue na esteira
      // aérea da parede, ramal para a bancada e desce até à entrada do FRL.
      const dropX = cmpDrop ? cmpDrop.x : out.p.x
      const dropZ = cmpDrop ? cmpDrop.z : out.p.z
      const benchDropX = benchDrop ? benchDrop.x : 0
      const benchDropZ = benchDrop ? benchDrop.z : 0
      airTube('ar-cmp-frl', 'AR 1', 'PU Ø10 · COMPRESSOR → FRL (entrada de ar)',
        { key: 'compressor', label: 'OUT' }, { key: 'airTreatment', label: 'IN' },
        [
          // Sobe em frente ao compressor (nunca por dentro dele) até à cota da esteira da parede,
          // desloca-se em Z até ao eixo da descida do compressor e sobe por ela.
          pt(out.p.x + 20, out.p.y + 10, out.p.z),
          pt(dropX, out.p.y + 10, dropZ + 22),
          pt(dropX, laneY - 80, dropZ + 22),
          pt(dropX, laneY, dropZ + 22),
          pt(dropX, laneY, wallTrayP ? wallTrayP.z : dropZ),
          pt(benchDropX + 24, laneY, wallTrayP ? wallTrayP.z : dropZ),
          pt(benchDropX + 24, laneY, benchDropZ + 20),
          // Desce pela descida da bancada e corre na calha de trás até à vertical do FRL.
          pt(benchDropX + 24, -top + 40, benchDropZ + 20),
          // O FRL está pendurado fora do perímetro (à esquerda da bancada): vai-se pela calha
          // lateral esquerda até à cota do FRL e sai em frente para a entrada de ar.
          pt(benchDropX + 24, -top + 40, -plate.widthMm / 2 + 17 + 12),
          pt(benchDropX + 24, inn.p.y, -plate.widthMm / 2 + 17 + 12),
          pt(-plate.lengthMm / 2 + 20, inn.p.y, -plate.widthMm / 2 + 17 + 12),
          pt(-plate.lengthMm / 2 + 20, inn.p.y, inn.p.z + 30),
          pt(inn.p.x + 30, inn.p.y, inn.p.z + 30),
          pt(inn.p.x + 30, inn.p.y, inn.p.z),
        ], 10)
    }

    // 2. FRL → P do CPV10 (alimentação da ilha de válvulas).
    if (frlPart && get('valveTerminal')) {
      const out = benchTerminalPointMm(frlPart, 'OUT')
      const pIn = benchTerminalPointMm(get('valveTerminal')!, 'P')
      const zRun = pIn.p.z - 26
      airTube('ar-frl-cpv', 'AR 2', 'PU Ø8 · FRL → CPV10 P (alimentação de ar)',
        { key: 'airTreatment', label: 'OUT' }, { key: 'valveTerminal', label: 'P' },
        [
          pt(out.p.x + 40, out.p.y, out.p.z),
          pt(out.p.x + 40, out.p.y, zRun),
          pt(pIn.p.x - 24, out.p.y, zRun),
          pt(pIn.p.x - 24, pIn.p.y, zRun),
        ], 8)
    }

    // 3. Saídas do CPV10 → cilindros (C1 esteira, C3 gaveta, C4 prensa) e ejetor de vácuo.
    // Estação 1 = Cil1 (A1/B1) · 2 = Cil2 (A2/B2) · 3 = Cil3 (A3/B3) · 4 = Cil4 (A4/B4) · 5 = vácuo (A5).
    const airRun = (
      id: string, number: string, valveLabel: string,
      target: { key: string; label: string }, lane: number, diameterMm = 6,
    ) => {
      const cpv = get('valveTerminal')
      const tgt = get(target.key)
      if (!cpv || !tgt) return
      const v = benchTerminalPointMm(cpv, valveLabel)
      const t = benchTerminalPointMm(tgt, target.label)
      // Percurso pela calha perimetral (a mesma dos condutores), a uma cota própria para os tubos
      // não se cruzarem com os cabos: sobe do CPV10 até à calha de trás, corre na calha até à
      // vertical da peça e desce até ao racore de ar.
      const yTubeDuct = top + 12 + 16 // metade de cima da calha (42 mm), pista dos tubos
      const zBack = -plate.widthMm / 2 + 17
      const zLane = zBack + lane
      airTube(id, number, `PU Ø${diameterMm} · ${valveLabel} → ${target.key} ${target.label}`,
        { key: 'valveTerminal', label: valveLabel }, target,
        [
          pt(v.p.x, v.p.y + 22, v.p.z),
          pt(v.p.x, v.p.y + 22, zLane),
          pt(v.p.x, yTubeDuct, zLane),
          pt(t.p.x, yTubeDuct, zLane),
          pt(t.p.x, t.p.y + 30, zLane),
          pt(t.p.x, t.p.y + 30, t.p.z),
          pt(t.p.x, t.p.y + 12, t.p.z),
        ], diameterMm)
    }
    // Estação 5 (vácuo): A5 alimenta o ejetor Venturi; o vácuo gerado vai à ventosa do braço.
    airRun('ar-vac-p', 'AR 9', 'A5', { key: 'ejector', label: 'P' }, -6)
    {
      const ej = get('ejector'), arm = get('arm')
      if (ej && arm) {
        const v = benchTerminalPointMm(ej, 'V')
        const a = benchTerminalPointMm(arm, 'VAC')
        const yTubeDuct = top + 12 + 16
        const zFront = plate.widthMm / 2 - 17
        airTube('ar-vac-suc', 'AR 10', 'PU Ø6 · VÁCUO · ejetor → ventosa do braço',
          { key: 'ejector', label: 'V' }, { key: 'arm', label: 'VAC' },
          [
            pt(v.p.x - 18, v.p.y, v.p.z),
            // Sobe pelo lado esquerdo da bancada (fora da magazine e do magRiser) e corre na calha
            // frontal até à vertical do braço.
            pt(v.p.x - 18, v.p.y, -plate.widthMm / 2 + 17 + 12),
            pt(v.p.x - 18, yTubeDuct, -plate.widthMm / 2 + 17 + 12),
            pt(a.p.x, yTubeDuct, -plate.widthMm / 2 + 17 + 12),
            pt(a.p.x, a.p.y + 40, -plate.widthMm / 2 + 17 + 12),
            pt(a.p.x, a.p.y + 40, a.p.z + 42),
            pt(a.p.x - 14, a.p.y + 16, a.p.z + 42),
          ], 6)
      }
    }

    // Entrada de 230 V da fonte PS1 via ficha CEE na tomada XS-MAQ:
    // contacto tomada↔ficha + fios L/N/PE da ficha aos bornes do quadro (PS1 / terra).
    const ps1 = get('psu24')
    const x20bus = get('terminals-x20')
    const xsMaq = get('socket-bench')
    const plugMaq = get('plug-bench')
    if (ps1 && x20bus && xsMaq && plugMaq) {
      // Contacto de encaixe XS-MAQ → F-MAQ
      for (const [sockLab, plugLab, color, kind] of [
        ['OUT.L', 'L', 'brown', 'power'],
        ['OUT.N', 'N', 'blue', 'neutral'],
        ['OUT.PE', 'PE', 'green-yellow', 'earth'],
      ] as const) {
        wires.push({
          id: `qe1-maq-contact-${plugLab.toLowerCase()}`,
          number: `XS-MAQ↔F-MAQ:${plugLab}`,
          label: `Contacto CEE · XS-MAQ ${sockLab} → F-MAQ ${plugLab}`,
          from: { key: 'socket-bench', label: sockLab },
          to: { key: 'plug-bench', label: plugLab },
          color, gauge: '1.5mm²', kind,
          waypointsMm: clean([
            pt(xsMaq.x, xsMaq.y, xsMaq.z + 20),
            pt(plugMaq.x, plugMaq.y, plugMaq.z - 10),
          ]),
        })
      }
      // Lado do quadro: sai pelo bucim da ficha → sobe à calha técnica → bornes L/N/PE.
      // Cabo revestido (sheathed) + filaçado no chicote qe1-alimentacao-plc.
      const plugGland = pt(plugMaq.x, plugMaq.y - 8, plugMaq.z + 40)
      for (const [psLabel, color, kind, lane] of [
        ['L', 'black', 'power', -2.5],
        ['N', 'blue', 'neutral', 2.5],
      ] as const) {
        wires.push({
          id: `qe1-ps1-${psLabel.toLowerCase()}`,
          number: `F-MAQ → PS1.${psLabel}`,
          label: `${psLabel === 'L' ? '230 V fase' : '230 V neutro'} · FICHA MAQ → PS1 ${psLabel}`,
          from: { key: 'plug-bench', label: psLabel },
          to: { key: ps1.key, label: psLabel },
          color, gauge: '1.5mm²', kind,
          sheathed: true, sheathColor: '#1c1917', conductorCount: 3,
          bundleId: 'qe1-alimentacao-plc',
          waypointsMm: clean([
            plugGland,
            // Sobe junto ao pilar / descida da esteira até à cota da calha do QE1.
            pt(xsMaq.x + lane, xsMaq.y + 45, ductInZ + lane),
            pt(ps1.x + (psLabel === 'L' ? -6 : 6), xsMaq.y + 45, ductInZ + lane),
            // Corre dentro da calha técnica até à fonte.
            pt(ps1.x + (psLabel === 'L' ? -6 : 6), ductTop ? ductTop.y : ps1.y + 40, ductInZ + lane),
            pt(ps1.x + (psLabel === 'L' ? -6 : 6), ps1.y + 18, ductInZ),
            pt(ps1.x + (psLabel === 'L' ? -6 : 6), ps1.y + 6, ductInZ),
          ]),
        })
      }
      // PE da ficha → calha → borne de terra X20.
      wires.push({
        id: 'qe1-maq-pe',
        number: 'F-MAQ → PE',
        label: 'PE · FICHA MAQ → terra do quadro',
        from: { key: 'plug-bench', label: 'PE' },
        to: { key: 'terminals-x20', label: 'PE-IN' },
        color: 'green-yellow', gauge: '1.5mm²', kind: 'earth',
        sheathed: true, sheathColor: '#1c1917', conductorCount: 3,
        bundleId: 'qe1-alimentacao-plc',
        waypointsMm: clean([
          plugGland,
          pt(xsMaq.x, xsMaq.y + 40, ductInZ),
          pt(x20bus.x, ductTop ? ductTop.y : x20bus.y + 40, ductInZ),
          pt(x20bus.x, railBottom(x20bus) - 12, ductInZ),
        ]),
      })
      // Saída da fonte para o barramento de 24 V (X20) e terra.
      for (const [psLabel, tgt, color, kind] of [['+V1', '+24V-IN', 'brown', 'power'], ['-V1', '0V-IN', 'blue', 'neutral'], ['PE', 'PE-IN', 'green-yellow', 'earth']] as const) {
        wires.push({
          id: `qe1-ps1-out-${psLabel.replace('+', 'p').replace('-', 'n').toLowerCase()}`,
          number: `PS1.${psLabel} → X20.${tgt}`,
          label: `${psLabel.startsWith('+') ? '+24 V' : psLabel.startsWith('-') ? '0 V' : 'PE'} · PS1 ${psLabel} → X20 ${tgt}`,
          from: { key: ps1.key, label: psLabel }, to: { key: 'terminals-x20', label: tgt },
          color, gauge: '1.5mm²', kind, bundleId: 'qe1-alimentacao-plc',
          waypointsMm: clean([
            pt(ps1.x + (psLabel.startsWith('+') ? -4 : 4), ps1.y + 6, ductInZ),
            pt(ps1.x + (psLabel.startsWith('+') ? -4 : 4), (ps1.y + x20bus.y) / 2, ductInZ + 3.5),
            pt(x20bus.x + (psLabel.startsWith('+') ? -4 : 4), (ps1.y + x20bus.y) / 2, ductInZ + 3.5),
            pt(x20bus.x + (psLabel.startsWith('+') ? -4 : 4), railBottom(x20bus) - 12, ductInZ),
          ]),
        })
      }
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
