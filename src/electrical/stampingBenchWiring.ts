/**
 * Cablagem da maquete de estampagem, derivada das cotas reais das peças de `stampingBenchLayout`:
 *
 * 1. Alimentação 230 V em cabo 3G2,5 (L castanho, N azul, PE verde/amarelo), do QGD às tomadas RoadEu:
 *    borne de saída X1 → bucim superior do QGD → subida → pescoço → esteira aérea → ramal/pescoço →
 *    descida → bucim superior da tomada → bornes L/N/PE. Ponteiras nas duas pontas, condutores filaçados.
 * 2. Cabos de campo (sensores, eletroválvulas, motor e botões) às réguas X21…X24 do QE1:
 *    aparelho → calha perimetral da base → descida pela perna → calha inferior → bucim lateral do QE1 →
 *    calha inferior do quadro → borne (ponta de campo = borne `2`).
 *
 * Coordenadas em mm relativas ao centro da base (como `BenchPlacement`).
 */
import * as THREE from 'three'
import type { ComponentType, WireColor, WireKind } from '../types'
import type { BenchPlacement } from './stampingBench'
import { BENCH_FIELD_TERMINALS } from './stampingBench'
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
}

/** Sinais de campo → peça e borne do aparelho (os marcadores vêm de `BENCH_FIELD_TERMINALS`). */
export const BENCH_FIELD_SOURCES: Record<string, { key: string; label: string } | undefined> = {
  B1: { key: 'drawerCylinder', label: 'AVA' },
  B2: { key: 'drawerCylinder', label: 'REC' },
  B3: { key: 'press', label: 'SUP' },
  B4: { key: 'press', label: 'INF' },
  B6: { key: 'arm', label: 'HOME' },
  B8: { key: 'feeder', label: 'REC' },
  B9: { key: 'feeder', label: 'AVA' },
  B11: { key: 'opticalSensor', label: 'OUT' },
  FC1: { key: 'fc1', label: 'NO' },
  FC2: { key: 'fc2', label: 'NO' },
  'S.IND': { key: 'inductiveSensor', label: 'OUT' },
  Y1: { key: 'valveIsland1', label: 'Y1' },
  Y2: { key: 'valveIsland1', label: 'Y2' },
  Y3: { key: 'valveIsland2', label: 'Y1' },
  Y4: { key: 'valveIsland2', label: 'Y2' },
  '0V': { key: 'valveIsland1', label: '0V' },
  'M+': { key: 'motor', label: 'CW' },
  'M-': { key: 'motor', label: 'CCW' },
  'ENC A': { key: 'motor', label: 'A' },
  'ENC B': { key: 'motor', label: 'B' },
  EMERG: { key: 'operator-emergency', label: '22' },
  AUTO: { key: 'operator-mode', label: '14' },
  REARME: { key: 'operator-reset', label: '4' },
  CICLO: { key: 'operator-cycle', label: '14' },
  STOP: { key: 'operator-stop', label: '2' },
  START: { key: 'operator-start', label: '4' },
}

const FIELD_COLORS: Record<string, WireColor> = { X21: 'black', X22: 'blue', X23: 'violet', X24: 'red' }

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
    const perimeterTo = (from: BenchPointMm, j: number, allowFront = true): BenchPointMm[] => {
      const dl = ((j % 5) - 2) * 3 // pistas lado a lado dentro da calha
      const y = yDuct + Math.floor(j / 5) * 4
      const candidates = [
        { side: 'front', d: Math.abs(from.z - zf), p: pt(from.x, y, zf + dl) },
        { side: 'back', d: Math.abs(from.z - zb), p: pt(from.x, y, zb + dl) },
        { side: 'left', d: Math.abs(from.x - xl), p: pt(xl + dl, y, from.z) },
        { side: 'right', d: Math.abs(from.x - xr), p: pt(xr + dl, y, from.z) },
      ].filter((c) => allowFront || c.side !== 'front').sort((a, b) => a.d - b.d)
      const entry = candidates[0]
      const out: BenchPointMm[] = [entry.p]
      if (entry.side === 'front') out.push(pt(xl + dl, y, zf + dl))
      if (entry.side === 'right') out.push(pt(xr + dl, y, zb + dl), pt(xl + dl, y, zb + dl))
      if (entry.side === 'back') out.push(pt(xl + dl, y, zb + dl))
      out.push(pt(xl + dl, y, zDrop + dl))
      return out
    }

    let j = 0
    for (const [strip, markers] of BENCH_FIELD_TERMINALS) {
      markers.forEach((marker, i) => {
        const src = BENCH_FIELD_SOURCES[marker]
        const term = get(`terminals-${strip}-${i + 1}`)
        const part = src ? get(src.key) : undefined
        if (!src || !term || !part) return
        const { p, n } = benchTerminalPointMm(part, src.label)
        const exit = pt(p.x + n.x * 14, p.y + n.y * 14, p.z + n.z * 14)
        // Desloca-se à cota da saída (ou por cima da calha) até à calha mais próxima e desce para dentro.
        // Botões: descem por dentro da caixa e saem pelo fundo (a caixa está 42 mm acima da base).
        const travelY = part.key.startsWith('operator-') ? top + 24 : Math.max(exit.y, top + 48)
        // A calha frontal fica para a caixa de botões; sensores e válvulas descem para a traseira/laterais.
        const path = perimeterTo(exit, j, part.key.startsWith('operator-'))
        const first = path[0]
        const lane = ((j % 5) - 2) * 3
        const termX = term.x
        const pts = [
          exit,
          pt(exit.x, travelY, exit.z),
          pt(first.x, travelY, first.z),
          ...path,
          // Desce pela calha vertical da perna até à calha inferior e segue até ao bucim lateral do QE1.
          pt(ductDrop.x + lane * 0.5, top - 4, zDrop + lane),
          pt(ductDrop.x + lane * 0.5, yUnder + lane * 0.4, zDrop + lane),
          pt(cabLeft - 18, yUnder + lane * 0.4, zDrop + lane * 0.5),
          pt(cabLeft + 8, yUnder, zDrop),
          // Dentro do QE1: entra na calha técnica inferior, corre até ao borne e sobe.
          pt(cabLeft + 30, ductBottom.y + lane * 0.4, ductInZ + lane * 0.5),
          pt(termX, ductBottom.y + lane * 0.4, ductInZ + lane * 0.5),
          pt(termX, ductBottom.y + 40, ductInZ),
        ]
        wires.push({
          id: `mq-campo-${strip.toLowerCase()}-${i + 1}`,
          number: `${strip}.${i + 1}`,
          label: `${marker} · ${part.state?.labelText ?? part.key} → ${strip}.${i + 1}`,
          from: { key: src.key, label: src.label },
          to: { key: term.key, label: '2' },
          color: FIELD_COLORS[strip] ?? 'black',
          gauge: '0.75mm²',
          kind: strip === 'X22' || strip === 'X23' ? 'control' : 'signal',
          waypointsMm: clean(pts),
        })
        j += 1
      })
    }

    // Comum +24 V dos botões: X20 → EMERGÊNCIA e pontes entre operadores dentro da caixa.
    const chain: Array<[string, string]> = [
      ['operator-emergency', '21'], ['operator-mode', '13'], ['operator-reset', '3'],
      ['operator-cycle', '13'], ['operator-stop', '1'], ['operator-start', '3'],
    ]
    const x20 = get('terminals-x20')
    const emerg = get('operator-emergency')
    if (x20 && emerg) {
      const { p, n } = benchTerminalPointMm(emerg, '21')
      const exit = pt(p.x + n.x * 14, p.y + n.y * 14, p.z + n.z * 14)
      const path = perimeterTo(exit, j)
      const travelY = top + 24
      wires.push({
        id: 'mq-campo-x20-comum-botoes',
        number: 'X20:+24V',
        label: '+24 V · X20 → comum dos botões',
        from: { key: 'terminals-x20', label: '+24V-OUT' },
        to: { key: 'operator-emergency', label: '21' },
        color: 'red', gauge: '0.75mm²', kind: 'control',
        waypointsMm: clean([
          pt(x20.x, ductBottom.y + 40, ductInZ),
          pt(x20.x, ductBottom.y, ductInZ),
          pt(cabLeft + 30, ductBottom.y, ductInZ),
          pt(cabLeft + 8, yUnder, zDrop),
          pt(cabLeft - 18, yUnder, zDrop),
          pt(ductDrop.x, yUnder, zDrop),
          pt(ductDrop.x, top - 4, zDrop),
          ...[...path].reverse(),
          pt(path[0].x, travelY, path[0].z),
          pt(exit.x, travelY, exit.z),
          exit,
        ]),
      })
    }
    // Pontes curtas com percurso explícito (o traçado automático entre aparelhos de máquina vizinhos,
    // dentro da caixa de comando, é demasiado pesado e não acrescenta nada a uma ponte de 50 mm).
    const bridge = (aKey: string, aLabel: string, bKey: string, bLabel: string, lift: number): BenchPointMm[] => {
      const a = benchTerminalPointMm(get(aKey)!, aLabel)
      const b = benchTerminalPointMm(get(bKey)!, bLabel)
      const ea = pt(a.p.x + a.n.x * 12, a.p.y + a.n.y * 12, a.p.z + a.n.z * 12)
      const eb = pt(b.p.x + b.n.x * 12, b.p.y + b.n.y * 12, b.p.z + b.n.z * 12)
      const y = Math.max(ea.y, eb.y) + lift
      return clean([ea, pt(ea.x, y, ea.z), pt(eb.x, y, eb.z), eb])
    }
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
        color: 'red', gauge: '0.75mm²', kind: 'control',
        waypointsMm: clean([pt(ta.p.x, ta.p.y, back), pt(tb.p.x, tb.p.y, back)]),
      })
    }
    // 0 V das duas ilhas: ponte entre a ilha C2A e a C1A (que segue para X22.6).
    if (get('valveIsland1') && get('valveIsland2')) {
      wires.push({
        id: 'mq-campo-ponte-0v-ilhas',
        number: 'X22.6',
        label: 'Ponte 0 V · ilha C2A → ilha C1A',
        from: { key: 'valveIsland2', label: '0V' },
        to: { key: 'valveIsland1', label: '0V' },
        color: 'blue', gauge: '0.75mm²', kind: 'control',
        waypointsMm: bridge('valveIsland2', '0V', 'valveIsland1', '0V', 10),
      })
    }
  }
  return wires
}
