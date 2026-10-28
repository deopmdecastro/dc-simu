import * as THREE from 'three'
import type { ElectricalComponent, SpatialPoint3D, Wire, WireColor, WireEndType } from '../types'
import { PANEL_UNITS_PER_MM, SCHEMATIC_PX_PER_MM } from './modelPaths'
import { componentHalfExtents, isPanelBound, PLATE_THICKNESS, PLATE_Z } from './panelBounds'
import { panelToSchematicX, panelToSchematicY, schematicToPanelX, schematicToPanelY } from './panelLayout'
import { terminalNormalWorld3D, terminalWorld3D } from './terminal3D'
import { REAL_TERMINALS } from '../electrical/realInterfaces'

/**
 * Geometria física dos cabos no Painel 3D: extremidades (bornes ou pontas livres),
 * ponteiras/terminais orientados pela face do borne, traçado com raio de curvatura
 * e comprimento real. Funções puras — o desenho vive em Panel3D / WireEnd3D.
 */

export type V3 = [number, number, number]

export const WIRE_3D_COLORS: Record<WireColor, string> = {
  red: '#ef4444', blue: '#3b82f6', 'green-yellow': '#84cc16', black: '#1f2937',
  orange: '#f59e0b', grey: '#94a3b8', brown: '#92400e', white: '#f8fafc',
  pink: '#ec4899', violet: '#8b5cf6', green: '#22c55e', yellow: '#eab308', lightblue: '#67e8f9',
}

/** Diâmetro exterior aproximado do cabo isolado a partir da secção do condutor.
 * A cena do painel usa 0,01 unidade por mm, portanto o tubo mantém escala física. */
export function cableOuterDiameterMm(gauge: string): number {
  const area = Number.parseFloat(gauge.replace(',', '.'))
  if (!Number.isFinite(area) || area <= 0) return 2.8
  const conductorDiameter = Math.sqrt((4 * area) / Math.PI)
  const insulationPerSide = area <= 1.5 ? 0.7 : area <= 4 ? 0.85 : 1.05
  // Escala visual ~88% do físico: proporção próxima dos elementos do painel
  // sem voltar aos tubos excessivamente grossos da primeira versão.
  return Math.max(1.8, (conductorDiameter + insulationPerSide * 2) * 0.88)
}

/** Altura onde pontas livres desenhadas só no Esquema ficam no 3D (à frente da calha DIN). */
export const FREE_END_Z = PLATE_Z + PLATE_THICKNESS / 2 + 0.2

const v = (p: V3) => new THREE.Vector3(p[0], p[1], p[2])
const arr = (p: THREE.Vector3): V3 => [p.x, p.y, p.z]
const U = PANEL_UNITS_PER_MM

/* ------------------------------------------------------------- extremidades */

export type WireEndpoint3D = {
  position: V3
  /** Normal exterior da face do borne; null em pontas livres. */
  normal: V3 | null
  /** Cor do borne (a ponteira segue-a até ser personalizada). */
  terminalColor?: string
  /** Diâmetro físico estimado do encaixe; só altera a terminação, nunca o cabo. */
  socketDiameterMm?: number
  free: boolean
}

/** Posição física de uma ponta do cabo: borne real ou ponto livre. */
export function wireEndpoint3D(
  wire: Wire,
  side: 'from' | 'to',
  components: ElectricalComponent[],
  pivots: Record<string, THREE.Vector3>,
): WireEndpoint3D | null {
  const terminalId = side === 'from' ? wire.fromTerminalId : wire.toTerminalId
  const point2D = side === 'from' ? wire.fromPoint : wire.toPoint
  const point3D = side === 'from' ? wire.fromPoint3D : wire.toPoint3D
  if (point2D) {
    // O ponto 3D só vale enquanto continuar a ser a projeção do ponto do Esquema
    // (se a ponta foi movida no Esquema, o 3D acompanha).
    const inSync = point3D && Math.hypot(panelToSchematicX(point3D.x) - point2D.x, panelToSchematicY(point3D.y) - point2D.y) < 1.5
    const position: V3 = inSync && point3D ? [point3D.x, point3D.y, point3D.z] : [schematicToPanelX(point2D.x), schematicToPanelY(point2D.y), point3D?.z ?? FREE_END_Z]
    return { position, normal: null, free: true }
  }
  if (!terminalId) return null
  for (const component of components) {
    const terminal = component.terminals.find((candidate) => candidate.id === terminalId)
    if (!terminal) continue
    const pivot = pivots[component.id]
    if (!pivot) return null
    return {
      position: arr(terminalWorld3D(component, terminal, pivot)),
      normal: arr(terminalNormalWorld3D(component, terminal)),
      terminalColor: terminal.color,
      // `diameter` usa unidades do esquema; a escala física partilhada converte-o
      // para mm. 82% representa a abertura útil dentro do aro desenhado.
      socketDiameterMm: REAL_TERMINALS[component.type]?.find((spot) => spot.label === terminal.label)?.diameterMm
        ?? Math.max(1, Math.min(14, ((terminal.diameter ?? 9) / SCHEMATIC_PX_PER_MM) * 0.82)),
      free: false,
    }
  }
  return null
}

/** Terminais planos (assentam na face); os restantes entram no borne pela normal. */
export const FLAT_LUG_TYPES: WireEndType[] = ['ring', 'fork', 'faston']

/** Comprimento físico de cada terminação (mm), da ponta ao início do cabo isolado. */
export function wireEndLengthMm(type: WireEndType): number {
  switch (type) {
    case 'ferrule': return 14
    case 'ferruleDouble': return 16
    case 'pin': return 15
    case 'ring':
    case 'fork':
    case 'faston': return 20
    case 'tinned': return 8
    default: return 7
  }
}

export type WireEndGeometry = {
  type: WireEndType
  /** Ponta (posição do borne). */
  origin: V3
  /** Eixo unitário, da ponta para o cabo. */
  axis: V3
  /** Direção da espessura dos terminais planos. */
  normal: V3
  /** Quanto a terminação entra no borne (mm), só para ponteiras redondas. */
  embedMm: number
  /** Diâmetro útil do furo/encaixe onde esta ponta foi ligada. */
  socketDiameterMm?: number
  /** Distância (unidades) da ponta ao ponto onde o cabo isolado começa. */
  length: number
}

function endHead(endpoint: WireEndpoint3D, type: WireEndType, toward: V3): { head: V3; geometry: WireEndGeometry } {
  const tip = v(endpoint.position)
  const toWire = v(toward).sub(tip)
  const dir = toWire.lengthSq() > 1e-8 ? toWire.clone().normalize() : new THREE.Vector3(0, -1, 0)
  const normal = endpoint.normal ? v(endpoint.normal) : null
  const flat = FLAT_LUG_TYPES.includes(type)
  let axis = dir.clone()
  if (normal) {
    if (flat) {
      // assenta na face: o eixo segue o cabo projetado no plano da face
      const projected = dir.clone().addScaledVector(normal, -dir.dot(normal))
      axis = projected.lengthSq() > 1e-6 ? projected.normalize() : new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 1, 0)).normalize()
      if (axis.lengthSq() < 0.5) axis = new THREE.Vector3(1, 0, 0)
    } else axis = normal.clone()
  }
  const thick = normal && flat ? normal.clone() : new THREE.Vector3(0, 0, 1).addScaledVector(axis, -axis.z)
  if (thick.lengthSq() < 1e-6) thick.set(0, 1, 0).addScaledVector(axis, -axis.y)
  thick.normalize()
  // Toda a parte metálica tubular fica dentro do encaixe; fora do borne começa
  // diretamente o colar plástico. A profundidade não altera o cabo.
  const embedMm = normal && !flat && (type === 'ferrule' || type === 'ferruleDouble' || type === 'pin') ? 8 : 0
  const length = Math.max(0.01, (wireEndLengthMm(type) - embedMm) * U)
  const lift = normal && flat ? normal.clone().multiplyScalar(0.004) : new THREE.Vector3()
  const origin = tip.clone().add(lift)
  const head = origin.clone().addScaledVector(axis, length)
  return {
    head: arr(head),
    geometry: { type, origin: arr(origin), axis: arr(axis), normal: arr(thick), embedMm, socketDiameterMm: endpoint.socketDiameterMm, length },
  }
}

/* ------------------------------------------------------------------- traçado */

/** Direções de saída (unitárias) de cada ponta, para o cabo não dobrar logo à saída da terminação. */
export type WireLeads = { a?: V3 | null; b?: V3 | null }

/** Ponto onde o cabo, depois de sair em linha reta da terminação, começa a curvar.
 * O troço reto cresce com a viragem pedida para respeitar o raio mínimo (≈ 4× o diâmetro). */
function leadPoint(head: V3, axis: V3, next: V3, outerMm: number): V3 | null {
  const h = v(head)
  const ax = v(axis).normalize()
  const toNext = v(next).sub(h)
  const dist = toNext.length()
  if (dist < 1e-6) return null
  const turn = Math.acos(THREE.MathUtils.clamp(ax.dot(toNext.clone().normalize()), -1, 1))
  if (turn < 0.1) return null
  const d = outerMm * U
  const radius = Math.max(outerMm * 4, 8) * U
  const need = radius / Math.max(0.12, Math.tan((Math.PI - turn) / 2))
  const length = THREE.MathUtils.clamp(need + d * 1.5, d * 3, Math.max(d * 3, dist * 0.6))
  return arr(h.addScaledVector(ax, length))
}

/* ----------------------------------------------- obstáculos (chapa e corpos) */

/** Volume sólido a contornar: caixa envolvente de um componente, em unidades da cena. */
/** `hard`: máquina fora do quadro (motor) — o cabo contorna-a, nunca passa à frente dela. */
export type WireObstacle = THREE.Box3 & { hard?: boolean }

/** Caixas envolventes dos componentes do painel (o que o cabo tem de contornar). */
export function componentObstacles(components: ElectricalComponent[], pivots: Record<string, THREE.Vector3>): WireObstacle[] {
  const boxes: WireObstacle[] = []
  for (const component of components) {
    const pivot = pivots[component.id]
    if (!pivot) continue
    const half = componentHalfExtents(component)
    const box: WireObstacle = new THREE.Box3(
      new THREE.Vector3(pivot.x - half.x, pivot.y - half.y, pivot.z - half.z),
      new THREE.Vector3(pivot.x + half.x, pivot.y + half.y, pivot.z + half.z),
    )
    if (!isPanelBound(component)) box.hard = true
    boxes.push(box)
  }
  return boxes
}

/** Z mínimo (à frente da chapa de montagem) em que um cabo com este diâmetro pode passar. */
export const wireFrontLimit = (outerMm: number) => PLATE_Z + PLATE_THICKNESS / 2 + (outerMm / 2) * U + 0.01

const segmentHitsBox = (from: THREE.Vector3, to: THREE.Vector3, box: THREE.Box3): boolean => {
  const steps = 14
  const point = new THREE.Vector3()
  for (let step = 0; step <= steps; step += 1) {
    point.lerpVectors(from, to, step / steps)
    if (box.containsPoint(point)) return true
  }
  return false
}

/**
 * Afasta o traçado automático do que é sólido: nunca entra na chapa de montagem nem
 * atravessa o corpo dos componentes — passa à frente deles, como um cabo real.
 * As pontas (bornes) nunca se mexem; só os pontos intermédios ganham profundidade.
 */
export function clearObstacles(controls: V3[], outerMm: number, obstacles: WireObstacle[]): V3[] {
  if (controls.length < 3) return controls
  const out = controls.map((point) => [...point] as V3)
  const frontZ = wireFrontLimit(outerMm)
  for (let index = 1; index < out.length - 1; index += 1) out[index][2] = Math.max(out[index][2], frontZ)
  if (obstacles.length === 0) return out
  const pad = (outerMm / 2) * U + 0.02
  const grown = obstacles.map((box) => box.clone().expandByScalar(pad))
  for (let pass = 0; pass < 3; pass += 1) {
    let changed = false
    for (let index = 0; index < out.length - 1; index += 1) {
      const from = v(out[index])
      const to = v(out[index + 1])
      for (const box of grown) {
        // caixa onde a própria ponta está presa (o borne fica na face): não conta
        if (box.containsPoint(from) && index === 0) continue
        if (box.containsPoint(to) && index + 1 === out.length - 1) continue
        if (!segmentHitsBox(from, to, box)) continue
        const front = box.max.z
        if (index > 0 && out[index][2] < front) { out[index][2] = front; changed = true }
        if (index + 1 < out.length - 1 && out[index + 1][2] < front) { out[index + 1][2] = front; changed = true }
      }
    }
    if (!changed) break
  }
  return out
}

/** Faixas «calha» horizontais livres entre as filas de equipamentos (unidades do painel).
 * Cabos automáticos correm nestas calhas, como num quadro real, em vez de cada
 * um descer ao seu próprio nível — o resultado é organizado e legível. */
export function trunkLaneHints(obstacles: WireObstacle[]): number[] {
  if (obstacles.length === 0) return []
  const bands: Array<{ y0: number; y1: number }> = []
  const sorted = [...obstacles].sort((a, b) => a.min.y - b.min.y)
  for (const box of sorted) {
    const last = bands[bands.length - 1]
    // Equipamentos da mesma fila partilham a banda (tolerância de 0,3 → 30 mm).
    if (last && box.min.y <= last.y1 + 0.3) last.y1 = Math.max(last.y1, box.max.y)
    else bands.push({ y0: box.min.y, y1: box.max.y })
  }
  if (bands.length === 0) return []
  const lanes: number[] = []
  for (let i = 0; i < bands.length - 1; i++) {
    const gap = bands[i + 1].y0 - bands[i].y1
    if (gap > 0.12) lanes.push((bands[i].y1 + bands[i + 1].y0) / 2)
  }
  lanes.push(bands[0].y0 - 0.16, bands[bands.length - 1].y1 + 0.16)
  return lanes.sort((a, b) => a - b)
}

/** Hash estável por cabo (número ou id). */
const wireHash = (wire: Wire): number => {
  const key = wire.number || wire.id
  let h = 0
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) & 0xffff
  return h
}

/** Afastamento estável por cabo dentro da calha (cabo paralelo não pisa o vizinho): 9 faixas de 1,2 cm. */
const trunkSpread = (wire: Wire): number => ((wireHash(wire) % 9) - 4) * 0.012

/** Camada de profundidade (0–2) do troço de calha: cabos vizinhos correm a níveis diferentes e deixam de se fundir. */
const trunkLayer = (wire: Wire): number => Math.floor(wireHash(wire) / 9) % 3

/** Pontos de controlo (sem terminações) entre as duas pontas, respeitando traçado, flexibilidade e curva manual. */
export type TrunkPlan = { laneA: number; laneB: number; riserX?: number }

export function wireBodyPoints3D(wire: Wire, a: V3, b: V3, outerMm: number, leads: WireLeads = {}, obstacles: WireObstacle[] = [], trunkY?: number, plan?: TrunkPlan): V3[] {
  const manual = wire.waypoints3D?.map((point) => [point.x, point.y, point.z] as V3) ?? []
  let controls: V3[]
  let smooth = wire.flexibility === 'flexible' || wire.route === 'arc'
  if (manual.length > 0) controls = [a, ...manual, b]
  else if (wire.route === 'direct') { controls = [a, b]; smooth = false }
  else {
    const drop = -0.55 - Math.min(0.7, Math.abs(a[0] - b[0]) * 0.04)
    let channelY = THREE.MathUtils.lerp(a[1], b[1], Math.max(0, Math.min(1, wire.bend ?? 0.5))) + drop
    if (trunkY !== undefined) channelY = trunkY + trunkSpread(wire)
    if (wire.route === 'arc' || wire.flexibility === 'flexible') {
      const mid: V3 = [(a[0] + b[0]) / 2, wire.route === 'arc' ? channelY + (wire.curveOffset ?? 0) * 0.01 : Math.min(a[1], b[1]) + drop * 1.3, (a[2] + b[2]) / 2]
      controls = [a, mid, b]
    } else {
      // Camadas em profundidade só quando a calha é partilhada (trunkY): diâmetro + folga por camada.
      const layerZ = trunkY !== undefined ? trunkLayer(wire) * (outerMm * 0.01 * 1.15) : 0
      if (plan) {
        // Calha encostada à chapa (como uma calha real): o troço horizontal corre rente
        // à placa, em camadas; mudanças de fila sobem por uma calha vertical lateral.
        const ductZ = wireFrontLimit(outerMm) + 0.012 + layerZ
        const spread = trunkSpread(wire)
        const yA = plan.laneA + spread
        const yB = plan.laneB + spread
        if (plan.riserX === undefined || Math.abs(plan.laneA - plan.laneB) < 1e-6) {
          controls = [a, [a[0], yA, ductZ], [b[0], yA, ductZ], b]
        } else {
          const rx = plan.riserX + spread
          controls = [a, [a[0], yA, ductZ], [rx, yA, ductZ], [rx, yB, ductZ], [b[0], yB, ductZ], b]
        }
      } else controls = [a, [a[0], channelY, a[2] + layerZ], [b[0], channelY, b[2] + layerZ], b]
    }
  }
  // sólidos: a chapa e os corpos dos componentes não se atravessam
  controls = manual.length > 0
    ? controls.map((point, index) => (index === 0 || index === controls.length - 1
      ? point
      : [point[0], point[1], Math.max(point[2], wireFrontLimit(outerMm))] as V3))
    : clearObstacles(controls, outerMm, obstacles)
  // saída reta de cada terminação antes de curvar
  if (controls.length >= 2) {
    const first = leads.a ? leadPoint(a, leads.a, controls[1], outerMm) : null
    const last = leads.b ? leadPoint(b, leads.b, controls[controls.length - 2], outerMm) : null
    if (first) controls = [controls[0], first, ...controls.slice(1)]
    if (last) controls = [...controls.slice(0, -1), last, controls[controls.length - 1]]
  }
  if (smooth && controls.length > 2) {
    const curve = new THREE.CatmullRomCurve3(controls.map(v), false, 'centripetal', 0.5)
    return curve.getPoints(Math.max(28, controls.length * 16)).map(arr)
  }
  if (controls.length === 2) return controls
  return roundCorners(controls, outerMm)
}

/* ------------------------------------------------------- máquinas (obstáculos duros) */

/** Folga (u = 100 mm) entre o cabo e a máquina na projeção frontal. */
const HARD_CLEARANCE = 0.05
/** Raio à volta da própria ponta (no motor) onde o cabo pode entrar na máquina. */
const HARD_END_SKIRT = 0.7

/** Quantos pontos do traçado caem dentro da projeção X/Y de uma máquina (vista de frente, à frente ou por dentro). */
function hardHits(points: V3[], hard: WireObstacle[], ends: V3[]): number {
  if (hard.length === 0) return 0
  let hits = 0
  const p = new THREE.Vector3()
  for (const box of hard) {
    const own = ends.filter((end) => end[0] > box.min.x - 0.1 && end[0] < box.max.x + 0.1 && end[1] > box.min.y - 0.1 && end[1] < box.max.y + 0.1 && end[2] > box.min.z - 0.1 && end[2] < box.max.z + 0.1)
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = v(points[i])
      const b = v(points[i + 1])
      for (let step = 0; step <= 16; step += 1) {
        p.lerpVectors(a, b, step / 16)
        if (p.x <= box.min.x - HARD_CLEARANCE || p.x >= box.max.x + HARD_CLEARANCE || p.y <= box.min.y - HARD_CLEARANCE || p.y >= box.max.y + HARD_CLEARANCE) continue
        if (own.some((end) => Math.hypot(end[0] - p.x, end[1] - p.y, end[2] - p.z) < HARD_END_SKIRT)) continue
        hits += 1
      }
    }
  }
  return hits
}

/**
 * Procura calhas e coluna vertical que deixam o cabo fora das máquinas (motor). Gera
 * combinações de calhas (as do quadro e uma acima de cada máquina) e de colunas
 * (laterais, entre aparelhos e junto às máquinas) e fica com a mais curta sem colisão.
 * Devolve `undefined` se o traçado base já está livre ou se nada serve (mantém o base).
 */
function planAroundMachines(
  wire: Wire, from: WireEndpoint3D, to: WireEndpoint3D, outerMm: number,
  obstacles: WireObstacle[], base: TrunkPlan | undefined, baseHint: number | undefined, lanes: number[],
): { plan: TrunkPlan; hint: number } | undefined {
  const hard = obstacles.filter((box) => box.hard)
  if (hard.length === 0) return undefined
  const ends: V3[] = [from.position, to.position]
  const soft = obstacles.filter((box) => !box.hard)
  // Aparelhos onde o cabo nasce/termina não contam; passar à frente dos restantes custa 5× o comprimento coberto.
  const foreign = soft.filter((box) => !ends.some((end) => end[0] > box.min.x - 0.1 && end[0] < box.max.x + 0.1 && end[1] > box.min.y - 0.1 && end[1] < box.max.y + 0.1))
  const frontCover = (points: V3[]): number => {
    let covered = 0
    const p = new THREE.Vector3()
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = v(points[i])
      const b = v(points[i + 1])
      const stepMm = (a.distanceTo(b) / U) / 12
      for (let step = 0; step < 12; step += 1) {
        p.lerpVectors(a, b, (step + 0.5) / 12)
        if (foreign.some((box) => p.x > box.min.x && p.x < box.max.x && p.y > box.min.y && p.y < box.max.y)) covered += stepMm
      }
    }
    return covered
  }
  const evaluate = (plan: TrunkPlan, hint: number): { cost: number; hits: number; cover: number } => {
    const points = wireBodyPoints3D(wire, from.position, to.position, outerMm, {}, obstacles, hint, plan)
    const cover = frontCover(points)
    return { cost: polylineLengthMm(points) + 5 * cover, hits: hardHits(points, hard, ends), cover }
  }
  const baseEval = base && baseHint !== undefined ? evaluate(base, baseHint) : undefined
  // Base livre da máquina e sem passar à frente de aparelhos: mantém.
  if (baseEval && baseEval.hits === 0 && baseEval.cover < 1) return undefined

  const xs = new Set<number>()
  const sortedSoft = [...soft].sort((a, b) => a.min.x - b.min.x)
  let reach = -Infinity
  for (const box of sortedSoft) {
    if (reach !== -Infinity && box.min.x - reach > 0.2) xs.add((reach + box.min.x) / 2)
    reach = Math.max(reach, box.max.x)
  }
  if (sortedSoft.length > 0) { xs.add(sortedSoft[0].min.x - 0.12); xs.add(reach + 0.12) }
  for (const box of hard) { xs.add(box.min.x - 0.12); xs.add(box.max.x + 0.12) }
  xs.add((from.position[0] + to.position[0]) / 2)

  const wrongSide = (end: WireEndpoint3D, lane: number) => {
    const ny = end.normal?.[1] ?? 0
    return (ny > 0.5 && lane < end.position[1]) || (ny < -0.5 && lane > end.position[1]) ? 1 : 0
  }
  let best: { plan: TrunkPlan; hint: number; score: number } | undefined
  for (const laneA of lanes) {
    for (const laneB of lanes) {
      const risers: Array<number | undefined> = Math.abs(laneA - laneB) < 1e-6 ? [undefined] : [...xs]
      for (const riserX of risers) {
        const plan: TrunkPlan = riserX === undefined ? { laneA, laneB } : { laneA, laneB, riserX }
        const { cost, hits } = evaluate(plan, laneA)
        if (hits > 0) continue
        const score = cost + (wrongSide(from, laneA) + wrongSide(to, laneB)) * 400
        // só troca um traçado base válido por um claramente melhor
        if (baseEval && baseEval.hits === 0 && score >= baseEval.cost - 20) continue
        if (!best || score < best.score) best = { plan, hint: laneA, score }
      }
    }
  }
  return best ? { plan: best.plan, hint: best.hint } : undefined
}

/** Condutor rígido: cantos em arco de círculo com raio mínimo (≈ 4× o diâmetro). Nunca vincos agudos.
 * Em voltas muito fechadas o raio só encolhe quando os troços não deixam espaço; as pontas têm troço de saída próprio. */
export function roundCorners(points: V3[], outerMm: number): V3[] {
  if (points.length < 3) return points
  const radius = Math.max(outerMm * 4, 8) * U
  const out: V3[] = [points[0]]
  const last = points.length - 1
  for (let index = 1; index < last; index += 1) {
    const prev = v(points[index - 1])
    const corner = v(points[index])
    const next = v(points[index + 1])
    const toPrev = prev.clone().sub(corner)
    const toNext = next.clone().sub(corner)
    const lenPrev = toPrev.length()
    const lenNext = toNext.length()
    if (lenPrev < 1e-6 || lenNext < 1e-6) continue
    const dirPrev = toPrev.normalize()
    const dirNext = toNext.normalize()
    const cosPhi = THREE.MathUtils.clamp(dirPrev.dot(dirNext), -1, 1)
    const phi = Math.acos(cosPhi) // ângulo interior
    if (phi > Math.PI - 0.02) { out.push(arr(corner)); continue }
    const half = Math.max(0.05, phi / 2)
    const wanted = radius / Math.tan(half)
    const cut = Math.min(wanted, index === 1 ? lenPrev : lenPrev / 2, index === last - 1 ? lenNext : lenNext / 2)
    const start = corner.clone().addScaledVector(dirPrev, cut)
    const end = corner.clone().addScaledVector(dirNext, cut)
    const bisector = dirPrev.clone().add(dirNext)
    if (bisector.lengthSq() < 1e-8) { out.push(arr(corner)); continue }
    bisector.normalize()
    const center = corner.clone().addScaledVector(bisector, cut / Math.cos(half))
    const vs = start.clone().sub(center)
    const ve = end.clone().sub(center)
    const axis = new THREE.Vector3().crossVectors(vs, ve)
    if (axis.lengthSq() < 1e-10) { out.push(arr(corner)); continue }
    axis.normalize()
    const angle = vs.angleTo(ve)
    const steps = Math.max(6, Math.ceil(angle / 0.18))
    for (let step = 0; step <= steps; step += 1) out.push(arr(center.clone().add(vs.clone().applyAxisAngle(axis, (angle * step) / steps))))
  }
  out.push(points[last])
  return out
}

export type WirePath3D = {
  points: V3[]
  starts: [WireEndGeometry, WireEndGeometry]
}

const endTypeOf = (wire: Wire, side: 'from' | 'to'): WireEndType =>
  (side === 'from' ? wire.fromEndType : wire.toEndType) ?? wire.endType ?? 'none'

/** Traçado completo: cada terminação ocupa o início/fim do percurso e o cabo isolado liga as duas cabeças. */
export function buildWirePath3D(wire: Wire, from: WireEndpoint3D, to: WireEndpoint3D, obstacles: WireObstacle[] = []): WirePath3D {
  const outerMm = cableOuterDiameterMm(wire.gauge)
  // Calha mais próxima do nível médio das pontas: o corpo do cabo corre na calha
  // e nunca atravessa equipamentos (o `clearObstacles` trata da profundidade).
  let trunkHint: number | undefined
  let plan: TrunkPlan | undefined
  if (!wire.waypoints3D?.length && obstacles.length > 0 && wire.route !== 'direct' && wire.flexibility !== 'flexible' && wire.route !== 'arc') {
    const hardBoxes = obstacles.filter((box) => box.hard)
    // As calhas vêm só dos aparelhos do quadro; cada máquina ganha a sua calha, logo acima do topo.
    const lanes = [...new Set([...trunkLaneHints(obstacles.filter((box) => !box.hard)), ...hardBoxes.map((box) => box.max.y + 0.18)])].sort((a, b) => a - b)
    if (lanes.length > 0) {
      const laneFor = (end: WireEndpoint3D): number => {
        const y = end.position[1]
        const ny = end.normal?.[1] ?? 0
        // borne virado para cima → calha acima; para baixo → calha abaixo; senão a mais próxima
        const candidates = ny > 0.5 ? lanes.filter((l) => l > y) : ny < -0.5 ? lanes.filter((l) => l < y) : lanes
        const near = candidates.filter((l) => Math.abs(l - y) < 0.8)
        const pool = near.length > 0 ? near : candidates.length > 0 ? candidates : lanes
        return pool.reduce((best, l) => (Math.abs(l - y) < Math.abs(best - y) ? l : best), pool[0])
      }
      const laneA = laneFor(from)
      const laneB = laneFor(to)
      trunkHint = laneA
      plan = { laneA, laneB }
      if (Math.abs(laneA - laneB) > 1e-6) {
        // calha vertical: na lateral livre mais próxima dos equipamentos entre as duas calhas
        const lo = Math.min(laneA, laneB)
        const hi = Math.max(laneA, laneB)
        const between = obstacles.filter((box) => box.max.y > lo && box.min.y < hi && box.min.y > lo - 0.5)
        const midX = (from.position[0] + to.position[0]) / 2
        if (between.length > 0) {
          const left = Math.min(...between.map((box) => box.min.x)) - 0.05
          const right = Math.max(...between.map((box) => box.max.x)) + 0.05
          plan.riserX = Math.abs(midX - left) <= Math.abs(midX - right) ? left : right
        } else plan.riserX = midX
      }
      const around = planAroundMachines(wire, from, to, outerMm, obstacles, plan, trunkHint, lanes)
      if (around) { plan = around.plan; trunkHint = around.hint }
    }
  }
  const preliminary = wireBodyPoints3D(wire, from.position, to.position, outerMm, {}, obstacles, trunkHint, plan)
  const a = endHead(from, endTypeOf(wire, 'from'), preliminary[Math.min(1, preliminary.length - 1)])
  const b = endHead(to, endTypeOf(wire, 'to'), preliminary[Math.max(0, preliminary.length - 2)])
  const points = wireBodyPoints3D(wire, a.head, b.head, outerMm, { a: a.geometry.axis, b: b.geometry.axis }, obstacles, trunkHint, plan)
  return { points, starts: [a.geometry, b.geometry] }
}

/* ------------------------------------------------------------------- medidas */

/** Comprimento real do cabo em mm (isolado + terminações). */
export function wireLengthMm(path: WirePath3D): number {
  let total = 0
  for (let index = 1; index < path.points.length; index += 1) total += v(path.points[index]).distanceTo(v(path.points[index - 1]))
  return Math.round(total / U + wireEndLengthMm(path.starts[0].type) - path.starts[0].embedMm + wireEndLengthMm(path.starts[1].type) - path.starts[1].embedMm)
}

export function polylineLengthMm(points: V3[]): number {
  let total = 0
  for (let index = 1; index < points.length; index += 1) total += v(points[index]).distanceTo(v(points[index - 1]))
  return Math.round(total / U)
}

/** Índice de inserção (na lista de pontos manuais) do ponto mais próximo do traçado de controlo. */
export function waypointInsertIndex(chain: V3[], point: V3): number {
  let best = 0
  let bestDistance = Infinity
  const p = v(point)
  for (let index = 0; index < chain.length - 1; index += 1) {
    const segment = new THREE.Line3(v(chain[index]), v(chain[index + 1]))
    const closest = segment.closestPointToPoint(p, true, new THREE.Vector3())
    const distance = closest.distanceTo(p)
    if (distance < bestDistance) { bestDistance = distance; best = index }
  }
  return best
}

/** Ponto do traçado mais próximo de `point` (para inserir curvas com duplo clique exatamente sobre o cabo). */
export function closestPointOnPolyline(points: V3[], point: V3): V3 {
  let best: THREE.Vector3 | null = null
  let bestDistance = Infinity
  const p = v(point)
  for (let index = 0; index < points.length - 1; index += 1) {
    const closest = new THREE.Line3(v(points[index]), v(points[index + 1])).closestPointToPoint(p, true, new THREE.Vector3())
    const distance = closest.distanceTo(p)
    if (distance < bestDistance) { bestDistance = distance; best = closest }
  }
  return best ? arr(best) : point
}

export const toSpatial = (p: V3): SpatialPoint3D => ({ x: p[0], y: p[1], z: p[2] })
export const fromSpatial = (p: SpatialPoint3D): V3 => [p.x, p.y, p.z]
