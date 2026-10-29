import * as THREE from 'three'
import type { ElectricalComponent, SpatialPoint3D, Wire, WireColor, WireEndType } from '../types'
import { PANEL_UNITS_PER_MM, SCHEMATIC_PX_PER_MM, isMountingRail } from './modelPaths'
import { componentHalfExtents, isPanelBound, PLATE_THICKNESS, PLATE_Z } from './panelBounds'
import { panelToSchematicX, panelToSchematicY, schematicToPanelX, schematicToPanelY } from './panelLayout'
import { component3DDimensions, component3DScaleOf, component3DVolumeCenter, schematicRotationRadians, terminalNormalWorld3D, terminalWorld3D } from './terminal3D'
import { componentOrientationOf, orientationRadians } from './componentOrientation'
import { MOTOR_CAD, MOTOR_GLAND, MOTOR_SIZE } from './motorTerminalLayout'
import { REAL_TERMINALS } from '../electrical/realInterfaces'
import { sharedFerrulePort } from '../electrical/sharedFerrules'
import { keepWireOutsideSolids, segmentEntersBox } from './solidWireRouting'

/**
 * Geometria física dos cabos no Painel 3D: extremidades (bornes ou pontas livres),
 * ponteiras/terminais orientados pela face do borne, encaminhamento coordenado
 * em dois planos Z sem interseção cabo-a-cabo, curvas suaves com raio mínimo
 * industrial e proteção estrita da chapa de montagem e do motor.
 */

export type V3 = [number, number, number]

export const WIRE_3D_COLORS: Record<WireColor, string> = {
  red: '#ef4444', blue: '#3b82f6', 'green-yellow': '#84cc16', black: '#1f2937',
  orange: '#f59e0b', grey: '#94a3b8', brown: '#92400e', white: '#f8fafc',
  pink: '#ec4899', violet: '#8b5cf6', green: '#22c55e', yellow: '#eab308', lightblue: '#67e8f9',
}

/** Diâmetro exterior aproximado do cabo isolado a partir da secção do condutor. */
export function cableOuterDiameterMm(gauge: string): number {
  const area = Number.parseFloat(gauge.replace(',', '.'))
  if (!Number.isFinite(area) || area <= 0) return 2.8
  const conductorDiameter = Math.sqrt((4 * area) / Math.PI)
  const insulationPerSide = area <= 1.5 ? 0.7 : area <= 4 ? 0.85 : 1.05
  return Math.max(1.8, (conductorDiameter + insulationPerSide * 2) * 0.88)
}

/** Altura onde pontas livres desenhadas só no Esquema ficam no 3D (à frente da calha DIN). */
export const FREE_END_Z = PLATE_Z + PLATE_THICKNESS / 2 + 0.2

const v = (p: V3) => new THREE.Vector3(p[0], p[1], p[2])
const arr = (p: THREE.Vector3): V3 => [p.x, p.y, p.z]
const U = PANEL_UNITS_PER_MM

export const DOUBLE_FERRULE_PORT_MM = 2.4
/** Eixo lateral comum ao desenho do colar e às suas duas entradas. */
function doubleFerruleSide(axis: THREE.Vector3): THREE.Vector3 {
  const normal = new THREE.Vector3(0, 0, 1).addScaledVector(axis, -axis.z)
  if (normal.lengthSq() < 1e-6) normal.set(0, 1, 0).addScaledVector(axis, -axis.y)
  return new THREE.Vector3().crossVectors(axis, normal.normalize()).normalize()
}

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
  /** Posição vertical normalizada no próprio aparelho (0 = base, 1 = topo). */
  localY?: number
  /** Posição horizontal normalizada no próprio aparelho (0 = esq, 1 = dir). */
  localX?: number
  componentId?: string
  componentType?: ElectricalComponent['type']
  terminalLabel?: string
  /** Índice de canal na ponteira dupla partilhada (0..portCount-1). */
  portIndex?: number
  /** Total de entradas na ponteira dupla partilhada. */
  portCount?: number
  /** Verdadeiro nas pontas secundárias que reutilizam o colar físico 3D do condutor líder. */
  sharedFollower?: boolean
  /** Contexto geométrico para encaminhar cabos de potência pelo bucim M20 do motor. */
  motorContext?: { component: ElectricalComponent; pivot: V3; terminalLabel: string }
}

/** Converte coordenadas CAD (mm) do motor SEW para coordenadas mundiais do Painel 3D. */
export function motorCadToWorld(
  motor: ElectricalComponent,
  pivot: THREE.Vector3,
  cadX: number,
  cadY: number,
  cadZ: number,
): THREE.Vector3 {
  const nx = (cadX - MOTOR_CAD.minX) / MOTOR_SIZE.width
  const ny = (cadY - MOTOR_CAD.minY) / MOTOR_SIZE.height
  const nz = (cadZ - MOTOR_CAD.minZ) / MOTOR_SIZE.depth
  const size = component3DDimensions(motor)
  const scale = component3DScaleOf(motor)
  const local = new THREE.Vector3((nx - 0.5) * size.x, (ny - 0.5) * size.y, (nz - 0.5) * size.z)
    .add(component3DVolumeCenter(motor))
    .multiply(new THREE.Vector3(scale.x, scale.y, scale.z))
  const [rx, ry, rz] = orientationRadians(componentOrientationOf(motor))
  local.applyEuler(new THREE.Euler(rx, ry, rz, 'XYZ'))
  if (motor.mirrored) local.x *= -1
  return local.applyEuler(new THREE.Euler(0, 0, schematicRotationRadians(motor), 'XYZ')).add(pivot)
}

/** Inversa exata de `motorCadToWorld`: devolve coordenadas CAD (mm) do motor SEW. */
export function worldToMotorCad(
  motor: ElectricalComponent,
  pivot: THREE.Vector3,
  worldPoint: THREE.Vector3,
): THREE.Vector3 {
  const local = worldPoint.clone().sub(pivot)
  local.applyEuler(new THREE.Euler(0, 0, -schematicRotationRadians(motor), 'XYZ'))
  if (motor.mirrored) local.x *= -1
  const [rx, ry, rz] = orientationRadians(componentOrientationOf(motor))
  const invQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ')).invert()
  local.applyQuaternion(invQuat)
  const scale = component3DScaleOf(motor)
  local.divide(new THREE.Vector3(scale.x || 1, scale.y || 1, scale.z || 1))
  local.sub(component3DVolumeCenter(motor))
  const size = component3DDimensions(motor)
  return new THREE.Vector3(
    (local.x / size.x + 0.5) * MOTOR_SIZE.width + MOTOR_CAD.minX,
    (local.y / size.y + 0.5) * MOTOR_SIZE.height + MOTOR_CAD.minY,
    (local.z / size.z + 0.5) * MOTOR_SIZE.depth + MOTOR_CAD.minZ,
  )
}

/** Posição física de uma ponta do cabo: borne real ou ponto livre. */
export function wireEndpoint3D(
  wire: Wire,
  side: 'from' | 'to',
  components: ElectricalComponent[],
  pivots: Record<string, THREE.Vector3>,
  wires: Wire[] = [],
): WireEndpoint3D | null {
  const terminalId = side === 'from' ? wire.fromTerminalId : wire.toTerminalId
  const point2D = side === 'from' ? wire.fromPoint : wire.toPoint
  const point3D = side === 'from' ? wire.fromPoint3D : wire.toPoint3D
  if (point2D) {
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
    const ys = component.terminals.map((t) => t.y)
    const xs = component.terminals.map((t) => t.x)
    const spanY = ys.length > 1 ? Math.max(...ys) - Math.min(...ys) : 0
    const spanX = xs.length > 1 ? Math.max(...xs) - Math.min(...xs) : 0
    const localY = terminal.position3D?.y ?? (spanY > 4 ? 1 - (terminal.y - Math.min(...ys)) / spanY : 0.5)
    const localX = terminal.position3D?.x ?? (spanX > 4 ? (terminal.x - Math.min(...xs)) / spanX : 0.5)
    const position = terminalWorld3D(component, terminal, pivot)
    const normal = terminalNormalWorld3D(component, terminal)
    const endKind = endTypeOf(wire, side)
    // A sonda toca a segunda entrada do colar, acima da manga comum no borne.
    const sharedProbe = endKind === 'probe' && wires.some(other => other.id !== wire.id &&
      (['from', 'to'] as const).some(s => !(s === 'from' ? other.fromPoint : other.toPoint) && (s === 'from' ? other.fromTerminalId : other.toTerminalId) === terminalId && endTypeOf(other, s) === 'ferruleDouble'))
    if (sharedProbe) position.addScaledVector(normal, 10 * U).addScaledVector(doubleFerruleSide(normal), DOUBLE_FERRULE_PORT_MM * U)
    const portInfo = endKind === 'ferruleDouble' && wires.length > 0
      ? sharedFerrulePort(wires, wire.id, side)
      : { shared: false, portIndex: 0, portCount: 2, isLeader: true }
    return {
      position: arr(position),
      normal: arr(normal),
      terminalColor: terminal.color,
      socketDiameterMm: REAL_TERMINALS[component.type]?.find((spot) => spot.label === terminal.label)?.diameterMm
        ?? Math.max(1, Math.min(14, ((terminal.diameter ?? 9) / SCHEMATIC_PX_PER_MM) * 0.82)),
      free: false,
      localY,
      localX,
      componentId: component.id,
      componentType: component.type,
      terminalLabel: terminal.label,
      portIndex: portInfo.portIndex,
      portCount: portInfo.portCount,
      sharedFollower: portInfo.shared && !portInfo.isLeader,
      motorContext: component.type === 'motor3ph' ? { component, pivot: arr(pivot), terminalLabel: terminal.label } : undefined,
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
    case 'banana': return 24
    case 'probe': return 110
    default: return 7
  }
}

export type WireEndGeometry = {
  type: WireEndType
  origin: V3
  axis: V3
  normal: V3
  embedMm: number
  socketDiameterMm?: number
  length: number
  portCount?: number
}

function endHead(endpoint: WireEndpoint3D, type: WireEndType, toward: V3, outerMm = 2.8): { head: V3; geometry: WireEndGeometry } {
  const tip = v(endpoint.position)
  const toWire = v(toward).sub(tip)
  const dir = toWire.lengthSq() > 1e-8 ? toWire.clone().normalize() : new THREE.Vector3(0, -1, 0)
  const normal = endpoint.normal ? v(endpoint.normal) : null
  const flat = FLAT_LUG_TYPES.includes(type)
  const embedMm = normal && type === 'banana' ? 4 : normal && type === 'probe' ? 2
    : normal && !flat && (type === 'ferrule' || type === 'ferruleDouble' || type === 'pin') ? 8 : 0
  const length = Math.max(0.01, (wireEndLengthMm(type) - embedMm) * U)
  const plateSafeZ = PLATE_Z + PLATE_THICKNESS / 2 + (outerMm / 2) * U + 0.016
  let axis = dir.clone()
  if (normal) {
    if (flat) {
      const projected = dir.clone().addScaledVector(normal, -dir.dot(normal))
      axis = projected.lengthSq() > 1e-6 ? projected.normalize() : new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 1, 0)).normalize()
      if (axis.lengthSq() < 0.5) axis = new THREE.Vector3(1, 0, 0)
    } else if (normal.z < -0.35 && tip.z + normal.z * length < plateSafeZ) {
      // Borne traseiro junto à chapa (botoneiras/sinalizadores): saída ortogonal limpa sem sobrepor bornes superior/inferior do mesmo bloco.
      axis = Math.abs(dir.x) > Math.abs(dir.y) * 1.8 && Math.abs(dir.x) > 0.1
        ? new THREE.Vector3(Math.sign(dir.x), 0, 0)
        : new THREE.Vector3(0, endpoint.localY !== undefined ? (endpoint.localY >= 0.5 ? 1 : -1) : (dir.y > 0.25 ? 1 : -1), 0)
    } else axis = normal.clone()
  }
  const thick = normal && flat ? normal.clone() : new THREE.Vector3(0, 0, 1).addScaledVector(axis, -axis.z)
  if (thick.lengthSq() < 1e-6) thick.set(0, 1, 0).addScaledVector(axis, -axis.y)
  thick.normalize()
  const lift = normal && flat ? normal.clone().multiplyScalar(0.004) : new THREE.Vector3()
  const origin = tip.clone().add(lift)
  if (origin.z < plateSafeZ) origin.z = plateSafeZ
  const head = origin.clone().addScaledVector(axis, length)
  const nPorts = Math.max(2, endpoint.portCount ?? 2)
  if (type === 'ferruleDouble') {
    const pIdx = endpoint.portIndex ?? 0
    const lateral = (pIdx - (nPorts - 1) / 2) * (DOUBLE_FERRULE_PORT_MM * 2 * U)
    head.addScaledVector(doubleFerruleSide(axis), lateral)
  }
  if (head.z < plateSafeZ) head.z = plateSafeZ
  return {
    head: arr(head),
    geometry: { type, origin: arr(origin), axis: arr(axis), normal: arr(thick), embedMm, socketDiameterMm: endpoint.socketDiameterMm, length, portCount: type === 'ferruleDouble' ? nPorts : undefined },
  }
}

/* ----------------------------------------------- obstáculos (chapa e corpos) */

export type WireObstacle = THREE.Box3 & { hard?: boolean; rail?: boolean; componentId?: string }

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
    box.componentId = component.id
    if (isMountingRail(component.type)) box.rail = true
    if (!isPanelBound(component)) box.hard = true
    boxes.push(box)
  }
  return boxes
}

/** Z mínimo (à frente da chapa de montagem) em que um cabo com este diâmetro pode passar. */
export const wireFrontLimit = (outerMm: number) => PLATE_Z + PLATE_THICKNESS / 2 + (outerMm / 2) * U + 0.04

const segmentHitsBox = (from: THREE.Vector3, to: THREE.Vector3, box: THREE.Box3): boolean => {
  return segmentEntersBox(arr(from), arr(to), box)
}

export function clearObstacles(controls: V3[], outerMm: number, obstacles: WireObstacle[]): V3[] {
  if (controls.length < 2) return controls
  const out = controls.map((point) => [...point] as V3)
  const frontZ = wireFrontLimit(outerMm)
  for (let index = 1; index < out.length - 1; index += 1) out[index][2] = Math.max(out[index][2], frontZ)
  const activeObstacles = obstacles.filter((box) => !box.rail)
  if (activeObstacles.length === 0) return out
  const pad = (outerMm / 2) * U + 0.052
  const grown = activeObstacles.map((box) => {
    const expanded = box.clone().expandByScalar(pad)
    if (box.hard) expanded.expandByScalar(0.02)
    return expanded
  })
  const startPt = v(out[0])
  const endPt = v(out[out.length - 1])
  for (let pass = 0; pass < 8; pass += 1) {
    let changed = false
    for (let index = 0; index < out.length - 1; index += 1) {
      const from = v(out[index])
      const to = v(out[index + 1])
      for (const box of grown) {
        if (box.containsPoint(startPt) && (index === 0 || from.distanceTo(startPt) < 0.45)) continue
        if (box.containsPoint(endPt) && (index + 1 === out.length - 1 || to.distanceTo(endPt) < 0.45)) continue
        if (!segmentHitsBox(from, to, box)) continue
        const front = box.max.z + pad * 0.35
        if (index > 0 && out[index][2] < front) { out[index][2] = front; changed = true }
        if (index + 1 < out.length - 1 && out[index + 1][2] < front) { out[index + 1][2] = front; changed = true }
        if (!box.hard) continue
        for (const idx of [index, index + 1]) {
          if (idx <= 0 || idx >= out.length - 1) continue
          const p = v(out[idx])
          if (!box.containsPoint(p) && !segmentHitsBox(v(out[index]), v(out[index + 1]), box)) continue
          const cx = (box.min.x + box.max.x) * 0.5
          const cy = (box.min.y + box.max.y) * 0.5
          const targetX = p.x < cx ? box.min.x - pad * 0.5 : box.max.x + pad * 0.5
          const targetY = p.y < cy ? box.min.y - pad * 0.5 : box.max.y + pad * 0.5
          if (Math.abs(targetX - p.x) <= Math.abs(targetY - p.y)) {
            if (Math.abs(out[idx][0] - targetX) > 1e-4) { out[idx][0] = targetX; changed = true }
          } else {
            if (Math.abs(out[idx][1] - targetY) > 1e-4) { out[idx][1] = targetY; changed = true }
          }
          out[idx][2] = Math.max(out[idx][2], Math.max(frontZ, front))
        }
      }
    }
    if (!changed) break
  }
  for (let index = 1; index < out.length - 1; index += 1) {
    out[index][2] = Math.max(out[index][2], frontZ)
  }
  return out
}

/** Faixas «calha» horizontais livres entre as filas de equipamentos (unidades do painel). */
export function trunkLaneHints(obstacles: WireObstacle[]): number[] {
  const active = obstacles.filter((box) => !box.rail)
  if (active.length === 0) return []
  const bands: Array<{ y0: number; y1: number }> = []
  const sorted = [...active].sort((a, b) => a.min.y - b.min.y)
  for (const box of sorted) {
    const last = bands[bands.length - 1]
    if (last && box.min.y <= last.y1 + 0.3) last.y1 = Math.max(last.y1, box.max.y)
    else bands.push({ y0: box.min.y, y1: box.max.y })
  }
  if (bands.length === 0) return []
  const lanes: number[] = []
  for (let i = 0; i < bands.length - 1; i++) {
    const gap = bands[i + 1].y0 - bands[i].y1
    if (gap > 0.12) lanes.push((bands[i].y1 + bands[i + 1].y0) / 2)
  }
  lanes.push(bands[0].y0 - 0.18, bands[bands.length - 1].y1 + 0.18)
  return lanes.sort((a, b) => a - b)
}

/** Hash estável por cabo (mantido para chamadas isoladas sem contexto de painel). */
const wireHash = (wire: Wire): number => {
  const key = wire.number || wire.id
  let h = 0
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) & 0xffff
  return h
}

const trunkSpread = (wire: Wire): number => ((wireHash(wire) % 9) - 4) * 0.018
const trunkLayer = (wire: Wire): number => Math.floor(wireHash(wire) / 9) % 3

export type WireLeads = { a?: V3 | null; b?: V3 | null }

export type WireSlotOverride = {
  yOffsetA?: number
  yOffsetB?: number
  ductZA?: number
  ductZB?: number
  vertZA?: number
  vertZB?: number
  riserXOffset?: number
  riserZ?: number
  xStepA?: number
  xStepB?: number
}

export type TrunkPlan = { laneA: number; laneB: number; riserX?: number; slot?: WireSlotOverride }

/** Coalesce micro-troços intermédios demasiado curtos para permitir curvas suaves sem dobras agudas. */
function coalesceShortJogs(points: V3[], minLen: number): V3[] {
  if (points.length <= 3) return points
  const out: V3[] = [points[0]]
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = out[out.length - 1]
    const curr = points[i]
    const next = points[i + 1]
    const dPrev = v(curr).distanceTo(v(prev))
    if (dPrev < 1e-4) continue
    // Preserva sempre o primeiro ponto de saída axial junto ao borne (i === 1) e o último antes do borne (i === len-2)
    if (i > 1 && i < points.length - 2 && dPrev < minLen && v(next).distanceTo(v(curr)) < minLen) {
      continue
    }
    out.push(curr)
  }
  out.push(points[points.length - 1])
  return out
}

export function wireBodyPoints3D(
  wire: Wire,
  a: V3,
  b: V3,
  outerMm: number,
  leads: WireLeads = {},
  obstacles: WireObstacle[] = [],
  trunkY?: number,
  plan?: TrunkPlan,
): V3[] {
  const manual = wire.waypoints3D?.map((point) => [point.x, point.y, point.z] as V3) ?? []
  let controls: V3[]
  let smooth = wire.route === 'arc'
  const frontZ = wireFrontLimit(outerMm)
  const leadStep = Math.max(outerMm * 3.0 * U, 0.048)

  if (manual.length > 0) {
    controls = [a, ...manual, b]
  } else if (leads.a && leads.b && (endTypeOf(wire, 'from') === 'probe' || endTypeOf(wire, 'to') === 'probe')) {
    // Cabo de ensaio solto: tangentes axiais ao sair da ficha e do punho,
    // com folga para uma curva contínua, em vez de canais ortogonais do painel.
    const reach = Math.max(0.45, v(a).distanceTo(v(b)) * 0.55)
    const curve = new THREE.CubicBezierCurve3(v(a), v(a).addScaledVector(v(leads.a), reach), v(b).addScaledVector(v(leads.b), reach), v(b))
    return keepInFrontOfPlate(curve.getPoints(96).map(arr), outerMm)
  } else if (wire.route === 'direct') {
    controls = [a, b]
    smooth = false
  } else {
    const drop = -0.55 - Math.min(0.7, Math.abs(a[0] - b[0]) * 0.04)
    let channelY = THREE.MathUtils.lerp(a[1], b[1], Math.max(0, Math.min(1, wire.bend ?? 0.5))) + drop
    if (trunkY !== undefined) channelY = trunkY + trunkSpread(wire)

    if (wire.route === 'arc') {
      const midZ = Math.max((a[2] + b[2]) / 2, frontZ + 0.04)
      const mid: V3 = [(a[0] + b[0]) / 2, channelY + (wire.curveOffset ?? 0) * 0.01, midZ]
      controls = [a, mid, b]
    } else if (plan) {
      const slot = plan.slot
      const fallbackLayerZ = trunkY !== undefined ? trunkLayer(wire) * (outerMm * 0.01 * 1.45) : 0
      const ductZA = slot?.ductZA ?? (frontZ + 0.018 + fallbackLayerZ)
      const ductZB = slot?.ductZB ?? (frontZ + 0.018 + fallbackLayerZ)
      const yA = plan.laneA + (slot?.yOffsetA ?? trunkSpread(wire))
      const yB = plan.laneB + (slot?.yOffsetB ?? trunkSpread(wire))

      // Saída axial suave a partir de cada ponteira antes de curvar para o plano vertical frontal.
      const exitA: V3 = leads.a
        ? [a[0] + leads.a[0] * leadStep, a[1] + leads.a[1] * leadStep, Math.max(frontZ, a[2] + leads.a[2] * leadStep)]
        : a
      const exitB: V3 = leads.b
        ? [b[0] + leads.b[0] * leadStep, b[1] + leads.b[1] * leadStep, Math.max(frontZ, b[2] + leads.b[2] * leadStep)]
        : b

      // Plano vertical frontal (sempre à frente de todas as camadas horizontais das calhas, evitando cruzamentos X vs Y).
      const baseVertZ = Math.max(ductZA, ductZB) + 0.052
      const zVertA = Math.max(exitA[2], slot?.vertZA ?? baseVertZ)
      const zVertB = Math.max(exitB[2], slot?.vertZB ?? baseVertZ)
      const xA = exitA[0] + (slot?.xStepA ?? 0)
      const xB = exitB[0] + (slot?.xStepB ?? 0)

      const startChain: V3[] = [
        a,
        ...(v(exitA).distanceTo(v(a)) > 1e-4 ? [exitA] : []),
        ...(Math.abs(xA - exitA[0]) > 1e-4 || Math.abs(zVertA - exitA[2]) > 1e-4 ? [[xA, exitA[1], zVertA] as V3] : []),
        [xA, yA, zVertA],
        [xA, yA, ductZA],
      ]
      const endChain: V3[] = [
        [xB, yB, ductZB],
        [xB, yB, zVertB],
        ...(Math.abs(xB - exitB[0]) > 1e-4 || Math.abs(zVertB - exitB[2]) > 1e-4 ? [[xB, exitB[1], zVertB] as V3] : []),
        ...(v(exitB).distanceTo(v(b)) > 1e-4 ? [exitB] : []),
        b,
      ]

      if (plan.riserX === undefined || Math.abs(plan.laneA - plan.laneB) < 1e-6) {
        if (Math.abs(ductZA - ductZB) < 1e-4) {
          controls = [...startChain, ...endChain]
        } else {
          const midX = (xA + xB) * 0.5
          controls = [...startChain, [midX, yA, ductZA], [midX, yB, ductZB], ...endChain]
        }
      } else {
        const rx = plan.riserX + (slot?.riserXOffset ?? trunkSpread(wire))
        const zRiser = slot?.riserZ ?? Math.max(baseVertZ, ductZA + 0.048, ductZB + 0.048)
        controls = [
          ...startChain,
          [rx, yA, ductZA],
          [rx, yA, zRiser],
          [rx, yB, zRiser],
          [rx, yB, ductZB],
          ...endChain,
        ]
      }
    } else {
      const fallbackLayerZ = trunkY !== undefined ? trunkLayer(wire) * (outerMm * 0.01 * 1.45) : 0
      const ductZ = frontZ + 0.018 + fallbackLayerZ
      const zA = Math.max(a[2], ductZ + 0.048)
      const zB = Math.max(b[2], ductZ + 0.048)
      controls = [a, [a[0], channelY, zA], [a[0], channelY, ductZ], [b[0], channelY, ductZ], [b[0], channelY, zB], b]
    }
  }

  controls = controls.filter((pt, idx) => idx === 0 || v(pt).distanceTo(v(controls[idx - 1])) > 1e-4)
  controls = manual.length > 0
    ? controls.map((point, index) => (index === 0 || index === controls.length - 1
      ? [point[0], point[1], Math.max(point[2], frontZ - 0.025)] as V3
      : [point[0], point[1], Math.max(point[2], frontZ)] as V3))
    : clearObstacles(controls, outerMm, obstacles)
  controls = controls.map((point, index) =>
    index === 0 || index === controls.length - 1
      ? [point[0], point[1], Math.max(point[2], frontZ - 0.025)] as V3
      : [point[0], point[1], Math.max(point[2], frontZ)] as V3)

  if (manual.length === 0) {
    controls = coalesceShortJogs(controls, Math.max(outerMm * 2.4, 7) * U)
  }

  if (smooth && controls.length > 2) {
    const curve = new THREE.CatmullRomCurve3(controls.map(v), false, 'centripetal', 0.5)
    return keepInFrontOfPlate(curve.getPoints(Math.max(32, controls.length * 16)).map(arr), outerMm)
  }
  if (controls.length <= 2) return keepInFrontOfPlate(controls, outerMm)
  const radiusFactor = wire.flexibility === 'flexible' ? 7.2 : 5.6
  return keepInFrontOfPlate(roundCorners(controls, outerMm, radiusFactor), outerMm)
}

/* ------------------------------------------------------- máquinas (obstáculos duros) */

const HARD_CLEARANCE = 0.12
const HARD_END_SKIRT = 0.56

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

/** Determina se o borne fica no topo (+1), na base (-1) ou neutro (0) do respetivo aparelho. */
function terminalVerticalBias(end: WireEndpoint3D): -1 | 0 | 1 {
  const ny = end.normal?.[1] ?? 0
  const nz = end.normal?.[2] ?? 0
  if (ny > 0.45) return 1
  if (ny < -0.45) return -1
  if (nz < -0.35) return 0
  if (end.localY !== undefined) {
    if (end.localY >= 0.56) return 1
    if (end.localY <= 0.44) return -1
  }
  return 0
}

function chooseLaneForEndpoint(end: WireEndpoint3D, lanes: number[]): number {
  const y = end.position[1]
  const bias = terminalVerticalBias(end)
  const candidates = bias > 0
    ? lanes.filter((l) => l > y - 0.02)
    : bias < 0
      ? lanes.filter((l) => l < y + 0.02)
      : lanes
  const near = candidates.filter((l) => Math.abs(l - y) < 1.15)
  const pool = near.length > 0 ? near : candidates.length > 0 ? candidates : lanes
  return pool.reduce((best, l) => (Math.abs(l - y) < Math.abs(best - y) ? l : best), pool[0])
}

function planAroundMachines(
  wire: Wire, from: WireEndpoint3D, to: WireEndpoint3D, outerMm: number,
  obstacles: WireObstacle[], base: TrunkPlan | undefined, baseHint: number | undefined, lanes: number[],
): { plan: TrunkPlan; hint: number } | undefined {
  const hard = obstacles.filter((box) => box.hard && !box.rail)
  if (hard.length === 0) return undefined
  const ends: V3[] = [from.position, to.position]
  const soft = obstacles.filter((box) => !box.hard && !box.rail)
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
  if (baseEval && baseEval.hits === 0 && baseEval.cover < 1) return undefined

  const xs = new Set<number>()
  const sortedSoft = [...soft].sort((a, b) => a.min.x - b.min.x)
  let reach = -Infinity
  for (const box of sortedSoft) {
    if (reach !== -Infinity && box.min.x - reach > 0.14) xs.add((reach + box.min.x) / 2)
    reach = Math.max(reach, box.max.x)
  }
  if (sortedSoft.length > 0) { xs.add(sortedSoft[0].min.x - 0.18); xs.add(reach + 0.18) }
  for (const box of hard) { xs.add(box.min.x - 0.18); xs.add(box.max.x + 0.18) }

  const wrongSide = (end: WireEndpoint3D, lane: number) => {
    const bias = terminalVerticalBias(end)
    return (bias > 0 && lane < end.position[1] - 0.02) || (bias < 0 && lane > end.position[1] + 0.02) ? 1 : 0
  }
  let best: { plan: TrunkPlan; hint: number; score: number } | undefined
  for (const laneA of lanes) {
    if (wrongSide(from, laneA)) continue
    for (const laneB of lanes) {
      if (wrongSide(to, laneB)) continue
      const risers: Array<number | undefined> = Math.abs(laneA - laneB) < 1e-6 ? [undefined] : [...xs]
      for (const riserX of risers) {
        const plan: TrunkPlan = riserX === undefined ? { laneA, laneB } : { laneA, laneB, riserX }
        const { cost, hits } = evaluate(plan, laneA)
        if (hits > 0) continue
        const score = cost
        if (baseEval && baseEval.hits === 0 && score >= baseEval.cost - 20) continue
        if (!best || score < best.score) best = { plan, hint: laneA, score }
      }
    }
  }
  return best ? { plan: best.plan, hint: best.hint } : undefined
}

function computeBasePlan(
  wire: Wire,
  from: WireEndpoint3D,
  to: WireEndpoint3D,
  outerMm: number,
  obstacles: WireObstacle[],
): { trunkHint?: number; plan?: TrunkPlan } {
  const solidObstacles = obstacles.filter((box) => !box.rail)
  if (wire.waypoints3D?.length || solidObstacles.length === 0 || wire.route === 'direct' || wire.route === 'arc') {
    return {}
  }
  const hardBoxes = solidObstacles.filter((box) => box.hard)
  const lanes = [...new Set([...trunkLaneHints(solidObstacles.filter((box) => !box.hard)), ...hardBoxes.map((box) => box.max.y + 0.30)])].sort((a, b) => a - b)
  if (lanes.length === 0) return {}

  const laneA = chooseLaneForEndpoint(from, lanes)
  const laneB = chooseLaneForEndpoint(to, lanes)
  let trunkHint = laneA
  let plan: TrunkPlan = { laneA, laneB }

  if (Math.abs(laneA - laneB) > 1e-6) {
    const lo = Math.min(laneA, laneB)
    const hi = Math.max(laneA, laneB)
    const riserClearance = 0.18
    const between = solidObstacles
      .filter((box) => box.max.y > lo - 0.05 && box.min.y < hi + 0.05)
      .sort((a, b) => a.min.x - b.min.x)
    const midX = (from.position[0] + to.position[0]) / 2
    if (between.length > 0) {
      const candidates: number[] = [
        between[0].min.x - riserClearance,
        Math.max(...between.map((box) => box.max.x)) + riserClearance,
      ]
      let reach = between[0].max.x
      for (let i = 1; i < between.length; i += 1) {
        if (between[i].min.x - reach >= 0.14) {
          candidates.push((reach + between[i].min.x) / 2)
        }
        reach = Math.max(reach, between[i].max.x)
      }
      plan.riserX = candidates.reduce((best, cx) => (Math.abs(midX - cx) < Math.abs(midX - best) ? cx : best), candidates[0])
    } else {
      plan.riserX = midX
    }
  }
  const around = planAroundMachines(wire, from, to, outerMm, obstacles, plan, trunkHint, lanes)
  if (around) {
    plan = around.plan
    trunkHint = around.hint
  }
  return { trunkHint, plan }
}

/** Cantos em arco de círculo suave (12 subdivisões por curva) sem vincos poligonais. */
export function roundCorners(points: V3[], outerMm: number, radiusFactor = 5.6): V3[] {
  if (points.length < 3) return points
  const radius = Math.max(outerMm * radiusFactor, 11) * U
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
    const phi = Math.acos(cosPhi)
    if (phi > Math.PI - 0.02) { out.push(arr(corner)); continue }
    const half = Math.max(0.08, phi / 2)
    const wanted = radius / Math.tan(half)
    const cut = Math.min(wanted, index === 1 ? lenPrev * 0.85 : lenPrev * 0.48, index === last - 1 ? lenNext * 0.85 : lenNext * 0.48)
    if (cut < 1e-4) { out.push(arr(corner)); continue }
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
    const steps = Math.max(10, Math.ceil(angle / 0.12))
    for (let step = 0; step <= steps; step += 1) {
      out.push(arr(center.clone().add(vs.clone().applyAxisAngle(axis, (angle * step) / steps))))
    }
  }
  out.push(points[last])
  return out
}

export function keepInFrontOfPlate(points: V3[], outerMm: number, _manual = false): V3[] {
  if (points.length === 0) return points
  const limit = wireFrontLimit(outerMm)
  const endLimit = PLATE_Z + PLATE_THICKNESS / 2 + (outerMm / 2) * U + 0.012
  const last = points.length - 1
  return points.map((point, i) => {
    const zMin = i === 0 || i === last ? endLimit : limit
    return point[2] >= zMin ? point : ([point[0], point[1], zMin] as V3)
  })
}

export type WirePath3D = {
  points: V3[]
  starts: [WireEndGeometry, WireEndGeometry]
}

const endTypeOf = (wire: Wire, side: 'from' | 'to'): WireEndType =>
  (side === 'from' ? wire.fromEndType : wire.toEndType) ?? wire.endType ?? 'none'

function finishWireBody(
  points: V3[],
  wire: Wire,
  outerMm: number,
  obstacles: WireObstacle[],
  exits: Parameters<typeof keepWireOutsideSolids>[3],
): V3[] {
  const minZ = wireFrontLimit(outerMm)
  const instrument = endTypeOf(wire, 'from') === 'probe' || endTypeOf(wire, 'to') === 'probe'
  const safe = keepWireOutsideSolids(points, outerMm, obstacles, exits, minZ, wireHash(wire))
  if (!instrument || safe === points || safe.length < 3) return safe
  // Reservar espaço para a curva antes de calcular o desvio. Arredondar apenas
  // depois de contornar a caixa, sem voltar a cortar pelo corpo do aparelho.
  const roomy = keepWireOutsideSolids(points, outerMm + 40, obstacles, exits, minZ, wireHash(wire))
  const source = roomy.length > 2 ? roomy : safe
  const controls = source.filter((point, i) => {
    if (i === 0 || i === source.length - 1) return true
    const a = v(point).sub(v(source[i - 1])).normalize()
    const b = v(source[i + 1]).sub(v(point)).normalize()
    return a.dot(b) < 0.99999
  })
  for (const factor of [18, 12, 8, 4]) {
    const rounded = roundCorners(controls, outerMm, factor)
    if (keepWireOutsideSolids(rounded, outerMm, obstacles, exits, minZ, wireHash(wire)) === rounded) return rounded
  }
  return safe
}

function isMotorGlandEligible(end: WireEndpoint3D, endType: WireEndType): boolean {
  return Boolean(end.motorContext && endType !== 'probe' && endType !== 'banana')
}

/**
 * Encaminha um cabo de alimentação/terra do quadro até ao borne do motor SEW
 * entrando axialmente pelo bucim M20 frontal (`MOTOR_GLAND`) da caixa de ligação.
 */
function buildMotorGlandBody3D(
  panelEnd: WireEndpoint3D,
  panelHead: V3,
  panelAxis: V3,
  motorEnd: WireEndpoint3D,
  motorHead: V3,
  outerMm: number,
  obstacles: WireObstacle[],
): V3[] {
  const ctx = motorEnd.motorContext!
  const mPivot = v(ctx.pivot)
  const label = ctx.terminalLabel.toUpperCase()
  const slotMap: Record<string, { idx: number; dx: number; dy: number }> = {
    PE: { idx: 0, dx: -2.6, dy: -2.6 },
    U1: { idx: 1, dx: -2.6, dy: 2.6 },
    W2: { idx: 1, dx: -2.6, dy: 2.6 },
    V1: { idx: 2, dx: 2.6, dy: 2.6 },
    U2: { idx: 2, dx: 2.6, dy: 2.6 },
    W1: { idx: 3, dx: 2.6, dy: -2.6 },
    V2: { idx: 3, dx: 2.6, dy: -2.6 },
  }
  const { idx, dx, dy } = slotMap[label] ?? { idx: 1, dx: 0, dy: 0 }
  const cad = (cx: number, cy: number, cz: number): V3 => arr(motorCadToWorld(ctx.component, mPivot, cx, cy, cz))
  const headCad = worldToMotorCad(ctx.component, mPivot, v(motorHead))

  const frontZ = wireFrontLimit(outerMm)
  const panelAllBoxes = obstacles.filter((b) => b.componentId !== ctx.component.id && b.max.x < mPivot.x - 1.0 && !b.hard)
  const softBoxes = panelAllBoxes.filter((b) => !b.rail)
  const railBoxes = panelAllBoxes.filter((b) => b.rail)
  const railFrontZ = railBoxes.length > 0 ? Math.max(...railBoxes.map((b) => b.max.z)) + (outerMm / 2) * U + 0.045 : frontZ + 0.08
  const bottomDuctY = (softBoxes.length > 0 ? Math.min(...softBoxes.map((b) => b.min.y)) : Math.min(panelHead[1], 0)) - 0.15 - idx * 0.036
  const panelRightX = (softBoxes.length > 0 ? Math.max(...softBoxes.map((b) => b.max.x)) : panelHead[0]) + 0.12 + idx * 0.038
  const ductZ = Math.max(frontZ + 0.024, 0.01) + idx * 0.038

  const ownBox = obstacles.find((b) => b.componentId === panelEnd.componentId)
  const clearance = (outerMm / 2) * U + 0.045
  let leadStep = Math.max(outerMm * 3.0 * U, 0.05)
  if (ownBox) {
    if (panelAxis[2] > 0.5) leadStep = Math.max(leadStep, ownBox.max.z + clearance - panelHead[2])
    else if (panelAxis[1] > 0.5) leadStep = Math.max(leadStep, ownBox.max.y + clearance - panelHead[1])
    else if (panelAxis[1] < -0.5) leadStep = Math.max(leadStep, panelHead[1] - (ownBox.min.y - clearance))
    else if (panelAxis[0] > 0.5) leadStep = Math.max(leadStep, ownBox.max.x + clearance - panelHead[0])
    else if (panelAxis[0] < -0.5) leadStep = Math.max(leadStep, panelHead[0] - (ownBox.min.x - clearance))
  }
  const exitPanel: V3 = [
    panelHead[0] + panelAxis[0] * leadStep,
    panelHead[1] + panelAxis[1] * leadStep,
    Math.max(frontZ, panelHead[2] + panelAxis[2] * leadStep),
  ]

  const panelChain: V3[] = [panelHead]
  if (v(exitPanel).distanceTo(v(panelHead)) > 1e-4) panelChain.push(exitPanel)

  if (panelAxis[2] > 0.5 || panelAxis[1] > 0.35 || (panelEnd.localY !== undefined && panelEnd.localY > 0.6)) {
    // Borne superior/frontal (ex.: XG.PE): contorna pela margem esquerda do quadro (fora da calha DIN) até à calha inferior.
    const leftX = (panelAllBoxes.length > 0 ? Math.min(...panelAllBoxes.map((b) => b.min.x)) : panelHead[0]) - 0.14 - idx * 0.03
    const safeCrossZ = Math.max(ductZ + 0.05, railFrontZ, exitPanel[2])
    if (panelAxis[2] > 0.5) {
      panelChain.push(
        [leftX, exitPanel[1], safeCrossZ],
        [leftX, bottomDuctY, safeCrossZ],
        [leftX, bottomDuctY, ductZ],
      )
    } else {
      const topClearY = (softBoxes.length > 0
        ? Math.max(...softBoxes.filter((b) => b.min.x <= exitPanel[0] + 0.05).map((b) => b.max.y), exitPanel[1])
        : exitPanel[1]) + 0.10
      panelChain.push(
        [exitPanel[0], Math.max(exitPanel[1], topClearY), safeCrossZ],
        [leftX, Math.max(exitPanel[1], topClearY), safeCrossZ],
        [leftX, bottomDuctY, safeCrossZ],
        [leftX, bottomDuctY, ductZ],
      )
    }
  } else {
    const dropZ = Math.max(exitPanel[2], ductZ + 0.04)
    panelChain.push(
      [exitPanel[0], bottomDuctY, dropZ],
      [exitPanel[0], bottomDuctY, ductZ],
    )
  }

  const entryLeft = cad(-38 + idx * 8, MOTOR_GLAND.y + dy * 2.4, 94 + idx * 5.5)
  const frontSweep = cad(66 + dx * 2.2, MOTOR_GLAND.y + dy * 2.0, 98 + idx * 5.0)
  const glandMouth = cad(MOTOR_GLAND.x + dx, MOTOR_GLAND.y + dy, 88)
  const glandCap = cad(MOTOR_GLAND.x + dx, MOTOR_GLAND.y + dy, 73)
  const glandInner = cad(MOTOR_GLAND.x + dx, MOTOR_GLAND.y + dy, 50)

  const innerBoxPoints: V3[] = label === 'PE'
    ? [cad(114, 122.5, 44), cad(headCad.x, Math.max(126.0, headCad.y + 1.5), headCad.z + 4)]
    : label === 'U1' || label === 'W2'
      ? [cad(98, 120.5, 32), cad(headCad.x, Math.max(127.0, headCad.y + 2.2), headCad.z + 10)]
      : label === 'V1' || label === 'U2'
        ? [cad(112, 115.5, 25), cad(headCad.x, Math.max(126.2, headCad.y + 1.8), headCad.z + 8)]
        : [cad(124, 111.5, 22), cad(headCad.x, Math.max(125.5, headCad.y + 1.5), headCad.z + 7)]

  const rawControls: V3[] = [
    ...panelChain,
    [panelRightX, bottomDuctY, ductZ],
    [entryLeft[0], bottomDuctY, Math.max(ductZ, (ductZ + entryLeft[2]) * 0.5)],
    entryLeft,
    frontSweep,
    glandMouth,
    glandCap,
    glandInner,
    ...innerBoxPoints,
    motorHead,
  ]
  const deduped = rawControls.filter((pt, i) => i === 0 || v(pt).distanceTo(v(rawControls[i - 1])) > 1e-4)
  return keepInFrontOfPlate(roundCorners(deduped, outerMm, 3.6), outerMm)
}

/** Traçado individual de um cabo (compatível com chamadas isoladas e edição ao vivo). */
export function buildWirePath3D(
  wire: Wire,
  from: WireEndpoint3D,
  to: WireEndpoint3D,
  obstacles: WireObstacle[] = [],
  slotOverride?: WireSlotOverride,
): WirePath3D {
  const outerMm = cableOuterDiameterMm(wire.gauge)
  const fromType = endTypeOf(wire, 'from')
  const toType = endTypeOf(wire, 'to')
  const manual = (wire.waypoints3D?.length ?? 0) > 0
  const fromMotorGland = !manual && isMotorGlandEligible(from, fromType) && !to.motorContext
  const toMotorGland = !manual && isMotorGlandEligible(to, toType) && !from.motorContext

  if (toMotorGland || fromMotorGland) {
    const { trunkHint, plan } = computeBasePlan(wire, from, to, outerMm, obstacles)
    const effectivePlan = plan ? (slotOverride ? { ...plan, slot: slotOverride } : plan) : undefined
    const preliminary = wireBodyPoints3D(wire, from.position, to.position, outerMm, {}, obstacles, trunkHint, effectivePlan)
    const a = endHead(from, fromType, preliminary[Math.min(1, preliminary.length - 1)], outerMm)
    const b = endHead(to, toType, preliminary[Math.max(0, preliminary.length - 2)], outerMm)
    const glandBody = toMotorGland
      ? buildMotorGlandBody3D(from, a.head, a.geometry.axis, to, b.head, outerMm, obstacles)
      : buildMotorGlandBody3D(to, b.head, b.geometry.axis, from, a.head, outerMm, obstacles).slice().reverse()
    const safe = finishWireBody(
      glandBody,
      wire,
      outerMm,
      obstacles,
      [
        { componentId: from.componentId, axis: a.geometry.axis, glandBypass: fromMotorGland },
        { componentId: to.componentId, axis: b.geometry.axis, glandBypass: toMotorGland },
      ],
    )
    return { points: safe, starts: [a.geometry, b.geometry] }
  }

  const { trunkHint, plan } = computeBasePlan(wire, from, to, outerMm, obstacles)
  const effectivePlan = plan ? (slotOverride ? { ...plan, slot: slotOverride } : plan) : undefined
  const preliminary = wireBodyPoints3D(wire, from.position, to.position, outerMm, {}, obstacles, trunkHint, effectivePlan)
  const a = endHead(from, fromType, preliminary[Math.min(1, preliminary.length - 1)], outerMm)
  const b = endHead(to, toType, preliminary[Math.max(0, preliminary.length - 2)], outerMm)
  const body = wireBodyPoints3D(wire, a.head, b.head, outerMm, { a: a.geometry.axis, b: b.geometry.axis }, obstacles, trunkHint, effectivePlan)
  const safe = finishWireBody(keepInFrontOfPlate(body, outerMm), wire, outerMm, obstacles,
    [{ componentId: from.componentId, axis: a.geometry.axis }, { componentId: to.componentId, axis: b.geometry.axis }])
  return { points: safe, starts: [a.geometry, b.geometry] }
}

/* --------------------- separação 3D coordenada (zero cabo dentro de cabo) */

function segSegClosest3D(
  p1: THREE.Vector3, q1: THREE.Vector3,
  p2: THREE.Vector3, q2: THREE.Vector3,
): { dist: number; s: number; t: number; c1: THREE.Vector3; c2: THREE.Vector3 } {
  const u = new THREE.Vector3().subVectors(q1, p1)
  const wv = new THREE.Vector3().subVectors(q2, p2)
  const w = new THREE.Vector3().subVectors(p1, p2)
  const a = u.dot(u)
  const b = u.dot(wv)
  const c = wv.dot(wv)
  const d = u.dot(w)
  const e = wv.dot(w)
  const D = a * c - b * b
  let sN: number
  let sD = D
  let tN: number
  let tD = D

  if (D < 1e-10) {
    sN = 0
    sD = 1
    tN = e
    tD = c
  } else {
    sN = b * e - c * d
    tN = a * e - b * d
    if (sN < 0) { sN = 0; tN = e; tD = c }
    else if (sN > sD) { sN = sD; tN = e + b; tD = c }
  }
  if (tN < 0) {
    tN = 0
    if (-d < 0) sN = 0
    else if (-d > a) sN = sD
    else { sN = -d; sD = a }
  } else if (tN > tD) {
    tN = tD
    if (-d + b < 0) sN = 0
    else if (-d + b > a) sN = sD
    else { sN = -d + b; sD = a }
  }
  const s = Math.abs(sN) < 1e-10 ? 0 : sN / sD
  const t = Math.abs(tN) < 1e-10 ? 0 : tN / tD
  const c1 = p1.clone().addScaledVector(u, s)
  const c2 = p2.clone().addScaledVector(wv, t)
  return { dist: c1.distanceTo(c2), s, t, c1, c2 }
}

/**
 * Encaminha em conjunto todos os cabos de um painel 3D atribuindo sub-canais exclusivos
 * nas calhas horizontais, planos verticais separados e relaxação física 3D cápsula-a-cápsula
 * para impedir que qualquer cabo atravesse por dentro de outro cabo.
 */
export function buildAllWirePaths3D(
  wires: Wire[],
  components: ElectricalComponent[],
  pivots: Record<string, THREE.Vector3>,
  obstacles: WireObstacle[] = [],
): Map<string, WirePath3D> {
  const result = new Map<string, WirePath3D>()
  type Entry = {
    wire: Wire
    from: WireEndpoint3D
    to: WireEndpoint3D
    outerMm: number
    radius: number
    basePlan?: TrunkPlan
  }
  const entries: Entry[] = []
  for (const wire of wires) {
    const from = wireEndpoint3D(wire, 'from', components, pivots, wires)
    const to = wireEndpoint3D(wire, 'to', components, pivots, wires)
    if (!from || !to) continue
    const outerMm = cableOuterDiameterMm(wire.gauge)
    const { plan } = computeBasePlan(wire, from, to, outerMm, obstacles)
    entries.push({ wire, from, to, outerMm, radius: (outerMm * U) / 2, basePlan: plan })
  }

  // 1) Colorir por intervalos cada calha horizontal: cabos que se sobrepõem em X nunca partilham o mesmo canal (y, z).
  const slots = new Map<string, WireSlotOverride>()
  for (const e of entries) slots.set(e.wire.id, {})

  type SpanReq = { wireId: string; side: 'A' | 'B'; minX: number; maxX: number; outerMm: number }
  const byLane = new Map<number, SpanReq[]>()
  const addLaneSpan = (lane: number, wireId: string, side: 'A' | 'B', x0: number, x1: number, outerMm: number) => {
    const key = Math.round(lane * 1000) / 1000
    const list = byLane.get(key) ?? []
    list.push({ wireId, side, minX: Math.min(x0, x1), maxX: Math.max(x0, x1), outerMm })
    byLane.set(key, list)
  }

  for (const e of entries) {
    const p = e.basePlan
    if (!p) continue
    if (p.riserX === undefined || Math.abs(p.laneA - p.laneB) < 1e-6) {
      addLaneSpan(p.laneA, e.wire.id, 'A', e.from.position[0], e.to.position[0], e.outerMm)
    } else {
      addLaneSpan(p.laneA, e.wire.id, 'A', e.from.position[0], p.riserX, e.outerMm)
      addLaneSpan(p.laneB, e.wire.id, 'B', p.riserX, e.to.position[0], e.outerMm)
    }
  }

  const softBoxes = obstacles.filter((box) => !box.rail && !box.hard)
  let globalMaxDuctZ = PLATE_Z + PLATE_THICKNESS / 2 + 0.12
  for (const [laneVal, spans] of byLane) {
    spans.sort((a, b) => (a.minX - b.minX) || ((b.maxX - b.minX) - (a.maxX - a.minX)))
    const trackEnds: number[] = []
    const assignedTrack = new Map<SpanReq, number>()
    for (const sp of spans) {
      let t = trackEnds.findIndex((endX) => endX < sp.minX - 0.065)
      if (t < 0) {
        t = trackEnds.length
        trackEnds.push(sp.maxX)
      } else {
        trackEnds[t] = sp.maxX
      }
      assignedTrack.set(sp, t)
    }
    const totalTracks = Math.max(1, trackEnds.length)
    const belowBoxes = softBoxes.filter((b) => b.max.y < laneVal + 0.02)
    const aboveBoxes = softBoxes.filter((b) => b.min.y > laneVal - 0.02)
    const yFloor = belowBoxes.length > 0 ? Math.max(...belowBoxes.map((b) => b.max.y)) + 0.08 : laneVal - 0.24
    const yCeil = aboveBoxes.length > 0 ? Math.min(...aboveBoxes.map((b) => b.min.y)) - 0.08 : laneVal + 0.24
    const safeCenter = yCeil > yFloor ? (yFloor + yCeil) * 0.5 : laneVal
    const availSpan = Math.max(0.04, yCeil - yFloor)
    const stepY = totalTracks > 1 ? Math.min(0.026, Math.max(0.018, availSpan / (totalTracks - 1))) : 0
    for (const sp of spans) {
      const t = assignedTrack.get(sp) ?? 0
      const frontZ = wireFrontLimit(sp.outerMm)
      const targetY = safeCenter + (t - (totalTracks - 1) / 2) * stepY
      const yOffset = targetY - laneVal
      const zLayer = (t % 4) * 0.040
      const ductZ = frontZ + 0.018 + zLayer
      globalMaxDuctZ = Math.max(globalMaxDuctZ, ductZ)
      const s = slots.get(sp.wireId)!
      if (sp.side === 'A') {
        s.yOffsetA = yOffset
        s.ductZA = ductZ
        if (s.yOffsetB === undefined) { s.yOffsetB = yOffset; s.ductZB = ductZ }
      } else {
        s.yOffsetB = yOffset
        s.ductZB = ductZ
      }
    }
  }

  // 2) Colunas verticais entre calhas (risers): cada cabo recebe X e Z exclusivos.
  const byRiser = new Map<number, Entry[]>()
  for (const e of entries) {
    if (e.basePlan?.riserX === undefined) continue
    const key = Math.round(e.basePlan.riserX * 100) / 100
    const list = byRiser.get(key) ?? []
    list.push(e)
    byRiser.set(key, list)
  }
  for (const [, list] of byRiser) {
    list.sort((a, b) => a.from.position[0] - b.from.position[0])
    list.forEach((e, idx) => {
      const s = slots.get(e.wire.id)!
      const row = Math.floor(idx / 2)
      const layer = idx % 2
      s.riserXOffset = (row - (Math.ceil(list.length / 2) - 1) / 2) * 0.044
      s.riserZ = globalMaxDuctZ + 0.056 + layer * 0.042
    })
  }

  // 3) Subidas/descidas verticais junto aos bornes: desfasar Z/X quando dois bornes têm X muito próximo.
  type DropInfo = { wireId: string; side: 'A' | 'B'; x: number; y: number; termId: string }
  const drops: DropInfo[] = []
  for (const e of entries) {
    drops.push({ wireId: e.wire.id, side: 'A', x: e.from.position[0], y: e.from.position[1], termId: e.wire.fromTerminalId })
    drops.push({ wireId: e.wire.id, side: 'B', x: e.to.position[0], y: e.to.position[1], termId: e.wire.toTerminalId })
  }
  drops.sort((a, b) => a.x - b.x || a.y - b.y)
  const activeCols: Array<{ x: number; vLayer: number }> = []
  for (const d of drops) {
    let vLayer = 0
    const used = new Set<number>()
    for (const prev of activeCols) {
      if (Math.abs(prev.x - d.x) < 0.042) used.add(prev.vLayer)
    }
    while (used.has(vLayer)) vLayer += 1
    activeCols.push({ x: d.x, vLayer })
    const s = slots.get(d.wireId)!
    const zVal = globalMaxDuctZ + 0.052 + (vLayer % 4) * 0.042
    const xNudge = vLayer >= 4 ? ((vLayer % 2 === 0 ? 1 : -1) * 0.036) : 0
    if (d.side === 'A') { s.vertZA = zVal; s.xStepA = xNudge }
    else { s.vertZB = zVal; s.xStepB = xNudge }
  }

  // 4) Construir os traçados suaves iniciais com os canais atribuídos.
  const builtPaths = entries.map((e) => {
    const path = buildWirePath3D(e.wire, e.from, e.to, obstacles, slots.get(e.wire.id))
    const manual = (e.wire.waypoints3D?.length ?? 0) > 0
    const fromGland = !manual && isMotorGlandEligible(e.from, endTypeOf(e.wire, 'from')) && !e.to.motorContext
    const toGland = !manual && isMotorGlandEligible(e.to, endTypeOf(e.wire, 'to')) && !e.from.motorContext
    const pts = path.points.map((p) => new THREE.Vector3(p[0], p[1], p[2]))
    const pinned = pts.map((pt, idx) => {
      if (idx <= 1 || idx >= pts.length - 2) return true
      if (toGland && e.to.motorContext) {
        const cadPt = worldToMotorCad(e.to.motorContext.component, v(e.to.motorContext.pivot), pt)
        if (cadPt.z < 78 && cadPt.x > 46) return true
      }
      if (fromGland && e.from.motorContext) {
        const cadPt = worldToMotorCad(e.from.motorContext.component, v(e.from.motorContext.pivot), pt)
        if (cadPt.z < 78 && cadPt.x > 46) return true
      }
      return false
    })
    return {
      entry: e,
      starts: path.starts,
      pts,
      pinned,
      exits: [
        { componentId: e.from.componentId, axis: path.starts[0].axis, glandBypass: fromGland },
        { componentId: e.to.componentId, axis: path.starts[1].axis, glandBypass: toGland },
      ] as Parameters<typeof keepWireOutsideSolids>[3],
      minZ: wireFrontLimit(e.outerMm),
    }
  })

  // 5) Relaxação geométrica 3D cápsula-a-cápsula: garante zero penetrações cabo-dentro-de-cabo.
  const kernel = [0.22, 0.52, 0.82, 1.0, 0.82, 0.52, 0.22]
  const kHalf = 3
  const maxPasses = 32
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let anyCollision = false
    for (let i = 0; i < builtPaths.length; i += 1) {
      const A = builtPaths[i]
      const boxA = new THREE.Box3().setFromPoints(A.pts).expandByScalar(A.entry.radius + 0.01)
      for (let j = i + 1; j < builtPaths.length; j += 1) {
        const B = builtPaths[j]
        const boxB = new THREE.Box3().setFromPoints(B.pts).expandByScalar(B.entry.radius + 0.01)
        if (!boxA.intersectsBox(boxB)) continue

        const wA = A.entry.wire
        const wB = B.entry.wire
        const sharedPositions: THREE.Vector3[] = []
        if (wA.fromTerminalId && (wA.fromTerminalId === wB.fromTerminalId || wA.fromTerminalId === wB.toTerminalId)) {
          sharedPositions.push(A.pts[0])
        }
        if (wA.toTerminalId && (wA.toTerminalId === wB.fromTerminalId || wA.toTerminalId === wB.toTerminalId)) {
          sharedPositions.push(A.pts[A.pts.length - 1])
        }

        const reqDist = A.entry.radius + B.entry.radius + 0.006
        for (let s1 = 0; s1 < A.pts.length - 1; s1 += 1) {
          const a0 = A.pts[s1]
          const a1 = A.pts[s1 + 1]
          for (let s2 = 0; s2 < B.pts.length - 1; s2 += 1) {
            const b0 = B.pts[s2]
            const b1 = B.pts[s2 + 1]
            if (Math.max(a0.x, a1.x) + reqDist < Math.min(b0.x, b1.x) || Math.min(a0.x, a1.x) - reqDist > Math.max(b0.x, b1.x)) continue
            if (Math.max(a0.y, a1.y) + reqDist < Math.min(b0.y, b1.y) || Math.min(a0.y, a1.y) - reqDist > Math.max(b0.y, b1.y)) continue
            if (Math.max(a0.z, a1.z) + reqDist < Math.min(b0.z, b1.z) || Math.min(a0.z, a1.z) - reqDist > Math.max(b0.z, b1.z)) continue

            const hit = segSegClosest3D(a0, a1, b0, b1)
            if (hit.dist >= reqDist) continue
            if (sharedPositions.some((sp) => sp.distanceTo(hit.c1) < 0.22 || sp.distanceTo(hit.c2) < 0.22)) continue
            if (A.pinned[s1] && A.pinned[s1 + 1] && B.pinned[s2] && B.pinned[s2 + 1]) continue

            anyCollision = true
            const overlap = reqDist - hit.dist + 0.003
            const sep = hit.c1.clone().sub(hit.c2)
            if (sep.lengthSq() < 1e-8) {
              sep.set(0, 0, i > j ? 1 : -1)
            } else {
              sep.normalize()
            }

            const pushChain = (pts: THREE.Vector3[], pinned: boolean[], segIdx: number, dir: THREE.Vector3, amount: number, minZ: number) => {
              const centerIdx = Math.min(pts.length - 2, Math.max(1, segIdx))
              for (let k = -kHalf; k <= kHalf; k += 1) {
                const idx = centerIdx + k
                if (idx <= 0 || idx >= pts.length - 1 || pinned[idx]) continue
                const w = kernel[k + kHalf] * amount
                pts[idx].x += dir.x * w
                pts[idx].y += dir.y * w
                const nextZ = pts[idx].z + dir.z * w
                pts[idx].z = Math.max(minZ, nextZ)
              }
            }

            if (sep.z < -0.25 && A.pts[Math.max(1, s1)].z - overlap * 0.6 <= A.minZ + 0.005) {
              pushChain(B.pts, B.pinned, s2, new THREE.Vector3(-sep.x * 0.4, -sep.y * 0.4, Math.abs(sep.z) + 0.6).normalize(), overlap * 1.05, B.minZ)
            } else if (sep.z > 0.25 && B.pts[Math.max(1, s2)].z - overlap * 0.6 <= B.minZ + 0.005) {
              pushChain(A.pts, A.pinned, s1, new THREE.Vector3(sep.x * 0.4, sep.y * 0.4, Math.abs(sep.z) + 0.6).normalize(), overlap * 1.05, A.minZ)
            } else {
              pushChain(A.pts, A.pinned, s1, sep, overlap * 0.55, A.minZ)
              pushChain(B.pts, B.pinned, s2, sep.clone().negate(), overlap * 0.55, B.minZ)
            }
          }
        }
      }
    }
    if (pass < maxPasses - 4) {
      for (const item of builtPaths) {
        const copy = item.pts.map((p) => p.clone())
        for (let idx = 2; idx < item.pts.length - 2; idx += 1) {
          if (item.pinned[idx]) continue
          item.pts[idx].x = copy[idx].x * 0.82 + (copy[idx - 1].x + copy[idx + 1].x) * 0.09
          item.pts[idx].y = copy[idx].y * 0.82 + (copy[idx - 1].y + copy[idx + 1].y) * 0.09
          item.pts[idx].z = Math.max(item.minZ, copy[idx].z * 0.82 + (copy[idx - 1].z + copy[idx + 1].z) * 0.09)
        }
      }
    }
    for (const item of builtPaths) {
      const current = item.pts.map(arr)
      const safe = keepWireOutsideSolids(current, item.entry.outerMm, obstacles, item.exits, item.minZ, wireHash(item.entry.wire))
      if (safe !== current) {
        item.pts = safe.map(v)
        item.pinned = item.pts.map((_, idx) => idx <= 1 || idx >= item.pts.length - 2)
        anyCollision = true
      }
    }
    if (!anyCollision) break
  }

  for (const item of builtPaths) {
    const cleanPoints = keepWireOutsideSolids(keepInFrontOfPlate(item.pts.map(arr), item.entry.outerMm), item.entry.outerMm, obstacles, item.exits, wireFrontLimit(item.entry.outerMm), wireHash(item.entry.wire))
    result.set(item.entry.wire.id, { points: cleanPoints, starts: item.starts })
  }
  return result
}

/* ------------------------------------------------------------------- medidas */

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
