import * as THREE from 'three'
import type { ElectricalComponent, SpatialPoint3D, Wire, WireColor, WireEndType } from '../types'
import { PANEL_UNITS_PER_MM } from './modelPaths'
import { PLATE_THICKNESS, PLATE_Z } from './panelBounds'
import { panelToSchematicX, panelToSchematicY, schematicToPanelX, schematicToPanelY } from './panelLayout'
import { terminalNormalWorld3D, terminalWorld3D } from './terminal3D'

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
  // escala visual reduzida (~28%): os cabos reais ficavam demasiado grossos ao lado dos componentes
  return Math.max(1.6, (conductorDiameter + insulationPerSide * 2) * 0.72)
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
  const embedMm = normal && !flat && (type === 'ferrule' || type === 'ferruleDouble' || type === 'pin') ? 3 : 0
  const length = Math.max(0.01, (wireEndLengthMm(type) - embedMm) * U)
  const lift = normal && flat ? normal.clone().multiplyScalar(0.004) : new THREE.Vector3()
  const origin = tip.clone().add(lift)
  const head = origin.clone().addScaledVector(axis, length)
  return {
    head: arr(head),
    geometry: { type, origin: arr(origin), axis: arr(axis), normal: arr(thick), embedMm, length },
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

/** Pontos de controlo (sem terminações) entre as duas pontas, respeitando traçado, flexibilidade e curva manual. */
export function wireBodyPoints3D(wire: Wire, a: V3, b: V3, outerMm: number, leads: WireLeads = {}): V3[] {
  const manual = wire.waypoints3D?.map((point) => [point.x, point.y, point.z] as V3) ?? []
  let controls: V3[]
  let smooth = wire.flexibility === 'flexible' || wire.route === 'arc'
  if (manual.length > 0) controls = [a, ...manual, b]
  else if (wire.route === 'direct') { controls = [a, b]; smooth = false }
  else {
    const drop = -0.55 - Math.min(0.7, Math.abs(a[0] - b[0]) * 0.04)
    const channelY = THREE.MathUtils.lerp(a[1], b[1], Math.max(0, Math.min(1, wire.bend ?? 0.5))) + drop
    if (wire.route === 'arc' || wire.flexibility === 'flexible') {
      const mid: V3 = [(a[0] + b[0]) / 2, wire.route === 'arc' ? channelY + (wire.curveOffset ?? 0) * 0.01 : Math.min(a[1], b[1]) + drop * 1.3, (a[2] + b[2]) / 2]
      controls = [a, mid, b]
    } else controls = [a, [a[0], channelY, a[2]], [b[0], channelY, b[2]], b]
  }
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
export function buildWirePath3D(wire: Wire, from: WireEndpoint3D, to: WireEndpoint3D): WirePath3D {
  const outerMm = cableOuterDiameterMm(wire.gauge)
  const preliminary = wireBodyPoints3D(wire, from.position, to.position, outerMm)
  const a = endHead(from, endTypeOf(wire, 'from'), preliminary[Math.min(1, preliminary.length - 1)])
  const b = endHead(to, endTypeOf(wire, 'to'), preliminary[Math.max(0, preliminary.length - 2)])
  const points = wireBodyPoints3D(wire, a.head, b.head, outerMm, { a: a.geometry.axis, b: b.geometry.axis })
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
