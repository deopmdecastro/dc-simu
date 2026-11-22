import * as THREE from 'three'
import type { ElectricalComponent, SpatialPoint3D, Wire, WireColor, WireEndType } from '../types'
import { PANEL_UNITS_PER_MM, SCHEMATIC_PX_PER_MM, isMountingRail } from './modelPaths'
import { componentHalfExtents, isPanelBound, PLATE_THICKNESS, PLATE_Z } from './panelBounds'
import { enclosureDimsOf, enclosureHingeOf, ENCLOSURE, ENCLOSURE_PLATE_FRONT_MM, isCableDuctType, isEnclosureType, isSpiralWrapType } from './enclosureParts'
import { panelToSchematicX, panelToSchematicY, schematicToPanelX, schematicToPanelY } from './panelLayout'
import { component3DDimensions, component3DScaleOf, component3DVolumeCenter, schematicRotationRadians, terminalNormalWorld3D, terminalWorld3D } from './terminal3D'
import { componentOrientationOf, orientationRadians } from './componentOrientation'
import { MOTOR_BOX, MOTOR_CAD, MOTOR_GLAND, MOTOR_SIZE } from './motorTerminalLayout'
import { WATER_SUPPLY_BOX_JUNCTION_MM, WATER_SUPPLY_BOX_SIZE_MM, waterSupplyBoxWagoPortMm } from './hydraulicsModel'
import { REAL_TERMINALS } from '../electrical/realInterfaces'
import { sharedFerrulePort } from '../electrical/sharedFerrules'
import { isWireOutsideSolids, keepWireOutsideSolids, segmentEntersBox, OrientedWireBox, type EnclosureWallKind } from './solidWireRouting'
import { packBundleRosette, TIE_SPACING } from './bundleLacing'

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

/** Diâmetro exterior aproximado do cabo isolado ou tubo hidráulico/pneumático (Ø..mm). */
export function cableOuterDiameterMm(gauge: string, opts?: { conductorCount?: number; sheathed?: boolean }): number {
  const tubularMatch = gauge.match(/Ø\s*([0-9]+(?:[.,][0-9]+)?)\s*mm/i)
  if (tubularMatch) {
    const val = Number.parseFloat(tubularMatch[1].replace(',', '.'))
    if (Number.isFinite(val) && val > 0) return val
  }
  const area = Number.parseFloat(gauge.replace(',', '.'))
  if (!Number.isFinite(area) || area <= 0) return 2.8
  const conductorDiameter = Math.sqrt((4 * area) / Math.PI)
  const insulationPerSide = area <= 1.5 ? 0.7 : area <= 4 ? 0.85 : 1.05
  const n = Math.max(1, opts?.conductorCount ?? 1)
  const pack = n <= 1 ? 1 : Math.sqrt(n) * 0.85
  const jacket = opts?.sheathed ? (n <= 1 ? 0.55 : 0.85) : 0
  return Math.max(1.8, (conductorDiameter * pack + insulationPerSide * 2 + jacket) * 0.88)
}

/** Altura onde pontas livres desenhadas só no Esquema ficam no 3D (à frente da calha DIN). */
export const FREE_END_Z = PLATE_Z + PLATE_THICKNESS / 2 + 0.2

const v = (p: V3) => new THREE.Vector3(p[0], p[1], p[2])
const arr = (p: THREE.Vector3): V3 => [p.x, p.y, p.z]
const U = PANEL_UNITS_PER_MM

export const DOUBLE_FERRULE_PORT_MM = 2.4
export const FERRULE_COLLAR_MM = 6
export const DOUBLE_FERRULE_COLLAR_MM = 7
export const PROBE_EMBED_MM = 2
export const ferrulePortOffsetMm = (index: number, count: number) => (index - (count - 1) / 2) * DOUBLE_FERRULE_PORT_MM * 1.28
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
  /** Contexto geométrico para encaminhar cabos do motor pelo bucim M20. */
  motorContext?: { component: ElectricalComponent; pivot: V3; terminalLabel: string; endType: WireEndType }
  /** Contexto geométrico para encaminhar automaticamente os fios (+24V/PULSE/GND) pelo bucim superior da Caixa de Água até aos WAGO 221-2411 interiores. */
  waterBoxGlandContext?: { component: ElectricalComponent; pivot: V3; terminalLabel: string }
  /** Contexto geométrico para chicotes de aparelhos montados na porta de um quadro (`door`/`doorOuter`). */
  doorContext?: {
    enclosureId: string
    enclosurePivot: V3
    widthMm: number
    heightMm: number
    depthMm: number
    hingeSide: 'left' | 'right'
    doorOpen: boolean
  }
  /** ID do quadro onde o aparelho está alojado (quando montado no interior). */
  enclosureId?: string
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
    // Se um relé térmico está acoplado por baixo do contator, o borne inferior de bobina (ex.: A2)
    // sai lateralmente para a fenda adjacente em vez de atravessar o corpo do relé térmico.
    if (component.type.startsWith('contactor') && normal.y < -0.5) {
      const hasMatedRelay = components.some((other) => {
        if (!other.type.startsWith('thermalRelay')) return false
        const op = pivots[other.id]
        return Boolean(op && Math.abs(op.x - pivot.x) < 0.28 && op.y < pivot.y && pivot.y - op.y < 0.95)
      })
      if (hasMatedRelay) normal.set(localX >= 0.5 ? 1 : -1, 0, 0)
    }
    const endKind = endTypeOf(wire, side)
    const portInfo = (endKind === 'ferruleDouble' || endKind === 'probe') && wires.length > 0
      ? sharedFerrulePort(wires, wire.id, side)
      : { shared: false, portIndex: 0, portCount: 2, isLeader: true }
    // O pino da sonda toca a boca livre do mesmo colar que recebe a alimentação.
    if (endKind === 'probe' && portInfo.portIndex > 0) position
      .addScaledVector(normal, (DOUBLE_FERRULE_COLLAR_MM + PROBE_EMBED_MM) * U)
      .addScaledVector(doubleFerruleSide(normal), ferrulePortOffsetMm(portInfo.portIndex, portInfo.portCount) * U)
    const doorMount = component.panelMount && (component.panelMount.face === 'door' || component.panelMount.face === 'doorOuter')
      ? component.panelMount
      : undefined
    const doorEnc = doorMount ? components.find((e) => e.id === doorMount.enclosureId && isEnclosureType(e.type)) : undefined
    const doorEncPivot = doorEnc ? pivots[doorEnc.id] : undefined
    const doorDims = doorEnc ? enclosureDimsOf(doorEnc.state) : undefined
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
      sharedFollower: endKind === 'ferruleDouble' && portInfo.shared && !portInfo.isLeader,
      motorContext: (component.type === 'motor3ph' || component.type === 'motor1ph')
        ? { component, pivot: arr(pivot), terminalLabel: terminal.label, endType: endKind }
        : undefined,
      waterBoxGlandContext: component.type === 'waterSupplyBox' && Boolean(waterSupplyBoxWagoPortMm(terminal.label))
        ? { component, pivot: arr(pivot), terminalLabel: terminal.label }
        : undefined,
      doorContext: doorEnc && doorEncPivot && doorDims
        ? {
          enclosureId: doorEnc.id,
          enclosurePivot: arr(doorEncPivot),
          widthMm: doorDims.widthMm,
          heightMm: doorDims.heightMm,
          depthMm: doorDims.depthMm,
          hingeSide: enclosureHingeOf(doorEnc.state),
          doorOpen: doorEnc.state.doorOpen !== false,
        }
        : undefined,
      enclosureId: component.enclosureId,
    }
  }
  return null
}

/** Terminais planos (assentam na face); os restantes entram no borne pela normal. */
export const FLAT_LUG_TYPES: WireEndType[] = ['ring', 'fork', 'faston']

/** Comprimento físico de cada terminação (mm), da ponta ao início do cabo isolado. */
export function wireEndLengthMm(type: WireEndType): number {
  switch (type) {
    case 'ferrule': return 5.8 + FERRULE_COLLAR_MM  // +0.8 mm: isolamento encaixa sob o anel da ponteira
    case 'ferruleDouble': return 5 + DOUBLE_FERRULE_COLLAR_MM
    case 'heatShrink': return 12
    case 'pin': return 14
    case 'ring':
    case 'fork':
    case 'faston': return 18
    case 'tinned': return 8
    case 'banana': return 22
    case 'probe': return 96
    case 'hydraulicFitting': return 22
    case 'pneumaticPushIn': return 17
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
  /** Olhal apertado num perno: desenha anilha e porca por cima. */
  studNut?: boolean
}

function endHead(endpoint: WireEndpoint3D, type: WireEndType, toward: V3, outerMm = 2.8): { head: V3; geometry: WireEndGeometry } {
  const tip = v(endpoint.position)
  const toWire = v(toward).sub(tip)
  const dir = toWire.lengthSq() > 1e-8 ? toWire.clone().normalize() : new THREE.Vector3(0, -1, 0)
  const normal = endpoint.normal ? v(endpoint.normal) : null
  const flat = FLAT_LUG_TYPES.includes(type)
  // Probe: embed curto para a ponta assentar no borne; ferrules mais curtas
  // para não «saltar» fora do furo em bornes pequenos.
  const embedMm = normal && type === 'banana' ? 4 : normal && type === 'probe' ? PROBE_EMBED_MM
    : normal && !flat && (type === 'ferrule' || type === 'ferruleDouble' || type === 'heatShrink' || type === 'pin') ? 5 : 0
  const length = Math.max(0.01, (wireEndLengthMm(type) - embedMm) * U)
  const plateSafeZ = PLATE_Z + PLATE_THICKNESS / 2 + (outerMm / 2) * U + 0.016
  let axis = dir.clone()
  if (normal) {
    if (flat) {
      const projected = dir.clone().addScaledVector(normal, -dir.dot(normal))
      axis = projected.lengthSq() > 1e-6 ? projected.normalize() : new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 1, 0)).normalize()
      if (axis.lengthSq() < 0.5) axis = new THREE.Vector3(1, 0, 0)
    } else if (endpoint.doorContext) {
      // Aparelho montado na porta do armário: o cabo sai pela face INTERIOR da porta (normal -Z fechada, rodada com a dobradiça).
      const dc = endpoint.doorContext
      const inner = new THREE.Vector3(0, 0, -1)
      if (dc.doorOpen) {
        const side = dc.hingeSide === 'right' ? 1 : -1
        inner.applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(side * ENCLOSURE.openDeg))
      }
      axis = inner.normalize()
    } else if (normal.z < -0.35 && tip.z + normal.z * length < plateSafeZ) {
      // Borne traseiro junto à chapa (botoneiras/sinalizadores):
      // · borne superior de bloco duplo (`localY > 0.65`, ex.: B0.22 acima de B0.21) sai na lateral
      //   para contornar a ponteira inferior sem cruzar nem fazer laço por cima;
      // · borne inferior/único (`localY <= 0.65`, ex.: B0.21, H1.X1/X2) sai direito para baixo ao corredor.
      if (endpoint.localY !== undefined && endpoint.localY > 0.65) {
        axis = new THREE.Vector3(dir.x >= 0 ? 1 : -1, 0, 0)
      } else if (dir.y < -0.12) {
        axis = new THREE.Vector3(0, -1, 0)
      } else if (dir.y > 0.28 && Math.abs(dir.y) > Math.abs(dir.x) * 0.8) {
        axis = new THREE.Vector3(0, 1, 0)
      } else if (Math.abs(dir.x) > Math.abs(dir.y) * 2.2 && Math.abs(dir.x) > 0.1) {
        axis = new THREE.Vector3(Math.sign(dir.x), 0, 0)
      } else {
        axis = new THREE.Vector3(0, endpoint.localY !== undefined && endpoint.localY <= 0.5 ? -1 : (dir.y >= 0 ? 1 : -1), 0)
      }
    } else axis = normal.clone()
  }
  const thick = normal && flat ? normal.clone() : new THREE.Vector3(0, 0, 1).addScaledVector(axis, -axis.z)
  if (thick.lengthSq() < 1e-6) thick.set(0, 1, 0).addScaledVector(axis, -axis.y)
  thick.normalize()
  const lift = normal && flat ? normal.clone().multiplyScalar(0.004) : new THREE.Vector3()
  const origin = tip.clone().add(lift)
  if (origin.z < plateSafeZ) origin.z = plateSafeZ
  const head = origin.clone().addScaledVector(axis, length)
  const nPorts = Math.min(4, Math.max(2, endpoint.portCount ?? 2))
  if (type === 'ferruleDouble') {
    const pIdx = Math.min(nPorts - 1, endpoint.portIndex ?? 0)
    // Mesmo passo lateral do modelo 3D da ponteira (WireEnd3D) para o cabo
    // alinhar com a boca certa e não empilhar no centro.
    const lateral = ferrulePortOffsetMm(pIdx, nPorts) * U
    const side = doubleFerruleSide(axis)
    head.addScaledVector(side, lateral)
  }
  if (head.z < plateSafeZ) head.z = plateSafeZ
  return {
    head: arr(head),
    geometry: { type, origin: arr(origin), axis: arr(axis), normal: arr(thick), embedMm, socketDiameterMm: endpoint.socketDiameterMm, length, portCount: type === 'ferruleDouble' ? nPorts : undefined, studNut: type === 'ring' && Boolean(endpoint.motorContext) },
  }
}

/* ----------------------------------------------- obstáculos (chapa e corpos) */

export type WireObstacle = THREE.Box3 & {
  hard?: boolean
  rail?: boolean
  componentId?: string
  /** Calha técnica ranhurada (`cableDuct`): o interior é canal real de cabos. */
  duct?: boolean
  ductAxis?: 'x' | 'y'
  /** Parede de armário (`panelEnclosure`). */
  enclosureWall?: EnclosureWallKind
}

/**
 * Paredes sólidas do quadro (cascas finas): o interior fica livre para cabos e
 * aparelhos; as chapas (fundo, laterais, topo, base e folha da porta) bloqueiam.
 */
function enclosureWallObstacles(component: ElectricalComponent, pivot: THREE.Vector3): WireObstacle[] {
  const d = enclosureDimsOf(component.state)
  const sheet = ENCLOSURE.sheet * U
  const halfW = (d.widthMm * U) / 2
  const halfH = (d.heightMm * U) / 2
  const depth = d.depthMm * U
  const backZ = pivot.z - depth / 2
  const frontZ = backZ + depth
  const cx = pivot.x
  const cy = pivot.y
  const walls: Array<[EnclosureWallKind, number, number, number, number, number, number]> = [
    ['back', cx - halfW, cx + halfW, cy - halfH, cy + halfH, backZ, backZ + sheet],
    ['left', cx - halfW, cx - halfW + sheet, cy - halfH, cy + halfH, backZ, frontZ],
    ['right', cx + halfW - sheet, cx + halfW, cy - halfH, cy + halfH, backZ, frontZ],
    ['top', cx - halfW, cx + halfW, cy + halfH - sheet, cy + halfH, backZ, frontZ],
    ['bottom', cx - halfW, cx + halfW, cy - halfH, cy - halfH + sheet, backZ, frontZ],
  ]
  if (component.state.doorOpen === false) {
    walls.push(['door', cx - halfW, cx + halfW, cy - halfH, cy + halfH, frontZ - sheet, frontZ])
  }
  const out: WireObstacle[] = walls.map(([kind, minX, maxX, minY, maxY, minZ, maxZ]) => {
    const box: WireObstacle = new THREE.Box3(
      new THREE.Vector3(minX, minY, minZ),
      new THREE.Vector3(maxX, maxY, maxZ),
    )
    box.componentId = component.id
    box.hard = true
    box.enclosureWall = kind
    return box
  })
  // Porta aberta: volume orientado da folha metálica para impedir que cabos a atravessem.
  if (component.state.doorOpen !== false) {
    const side = enclosureHingeOf(component.state) === 'right' ? 1 : -1
    const dir = -side
    const hinge = new THREE.Vector3(cx + side * (halfW + 3 * U), cy, frontZ + 6 * U)
    const rot = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(side * ENCLOSURE.openDeg))
    const transform = new THREE.Matrix4().makeTranslation(hinge.x, hinge.y, hinge.z).multiply(rot)
    const skinZ = (ENCLOSURE.doorReturn - 4) * U
    const x0 = Math.min(dir * 3 * U, dir * (d.widthMm + 3) * U)
    const x1 = Math.max(dir * 3 * U, dir * (d.widthMm + 3) * U)
    const doorBox: WireObstacle = new OrientedWireBox(
      new THREE.Box3(new THREE.Vector3(x0, -halfH, skinZ - 3 * U), new THREE.Vector3(x1, halfH, skinZ + 1 * U)),
      transform,
    )
    doorBox.componentId = component.id
    doorBox.hard = true
    doorBox.enclosureWall = 'door'
    out.push(doorBox)
  }
  return out
}

export function componentObstacles(components: ElectricalComponent[], pivots: Record<string, THREE.Vector3>): WireObstacle[] {
  const boxes: WireObstacle[] = []
  for (const component of components) {
    const pivot = pivots[component.id]
    if (!pivot) continue
    // Quadro: cascas sólidas (paredes); o volume interior continua livre.
    if (isEnclosureType(component.type)) {
      boxes.push(...enclosureWallObstacles(component, pivot))
      continue
    }
    const half = componentHalfExtents(component)
    let box: WireObstacle = new THREE.Box3(
      new THREE.Vector3(pivot.x - half.x, pivot.y - half.y, pivot.z - half.z),
      new THREE.Vector3(pivot.x + half.x, pivot.y + half.y, pivot.z + half.z),
    )
    if ((component.type === 'motor3ph' || component.type === 'motor1ph')) {
      const origin = motorCadToWorld(component, pivot, 0, 0, 0)
      const transform = new THREE.Matrix4().makeBasis(
        motorCadToWorld(component, pivot, 1, 0, 0).sub(origin),
        motorCadToWorld(component, pivot, 0, 1, 0).sub(origin),
        motorCadToWorld(component, pivot, 0, 0, 1).sub(origin),
      ).setPosition(origin)
      box = new OrientedWireBox(new THREE.Box3(new THREE.Vector3(MOTOR_CAD.minX, MOTOR_CAD.minY, MOTOR_CAD.minZ), new THREE.Vector3(MOTOR_CAD.maxX, MOTOR_CAD.maxY, MOTOR_CAD.maxZ)), transform)
    }
    box.componentId = component.id
    // Calha DIN: os cabos passam por cima. Calha técnica: corpo `hard` identificado com `duct = true`
    // para que os cabos do quadro corram organizadamente pelo seu canal ranhurado interior.
    if (isMountingRail(component.type)) box.rail = true
    if (isCableDuctType(component.type)) {
      box.hard = true
      box.duct = true
      box.ductAxis = half.x >= half.y ? 'x' : 'y'
    } else if (isSpiralWrapType(component.type)) {
      box.hard = true
    }
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


/** Quebra segmentos diagonais em troços eixo-alinhados (X / Y / Z), evitando cabos «a atravessar» aparelhos em linha reta. */
function orthogonalizeSegments(points: V3[], preferYFirst = true): V3[] {
  if (points.length < 2) return points
  const out: V3[] = [[...points[0]] as V3]
  for (let i = 1; i < points.length; i++) {
    const prev = out[out.length - 1]
    const next = points[i]
    const dx = Math.abs(next[0] - prev[0])
    const dy = Math.abs(next[1] - prev[1])
    const dz = Math.abs(next[2] - prev[2])
    const active = (dx > 1e-4 ? 1 : 0) + (dy > 1e-4 ? 1 : 0) + (dz > 1e-4 ? 1 : 0)
    if (active <= 1) {
      if (v(prev).distanceToSquared(v(next)) > 1e-12) out.push([...next] as V3)
      continue
    }
    let cur: V3 = [...prev]
    // 1) Aprofundar / trazer ao plano de calha (Z)  2) Corredor (Y)  3) Avanço (X)
    if (dz > 1e-4) {
      cur = [cur[0], cur[1], next[2]]
      out.push(cur)
    }
    if (preferYFirst) {
      if (Math.abs(next[1] - cur[1]) > 1e-4) {
        cur = [cur[0], next[1], cur[2]]
        out.push(cur)
      }
      if (Math.abs(next[0] - cur[0]) > 1e-4) {
        cur = [next[0], cur[1], cur[2]]
        out.push(cur)
      }
    } else {
      if (Math.abs(next[0] - cur[0]) > 1e-4) {
        cur = [next[0], cur[1], cur[2]]
        out.push(cur)
      }
      if (Math.abs(next[1] - cur[1]) > 1e-4) {
        cur = [cur[0], next[1], cur[2]]
        out.push(cur)
      }
    }
    if (v(cur).distanceToSquared(v(next)) > 1e-12) out.push([...next] as V3)
  }
  return out
}

/** Se o traçado colapsou a uma reta (2 pontos), força um U por baixo — nunca diagonal longa. */
function ensureDetoured(points: V3[], outerMm: number): V3[] {
  if (points.length >= 3) return points
  if (points.length < 2) return points
  const a = points[0]
  const b = points[points.length - 1]
  const span = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
  if (span < 0.12) return points
  const frontZ = wireFrontLimit(outerMm) + 0.05
  const midY = Math.min(a[1], b[1]) - Math.max(0.28, Math.abs(a[1] - b[1]) * 0.15 + 0.22)
  return [
    a,
    [a[0], a[1], Math.max(a[2], frontZ)] as V3,
    [a[0], midY, frontZ] as V3,
    [b[0], midY, frontZ] as V3,
    [b[0], b[1], Math.max(b[2], frontZ)] as V3,
    b,
  ]
}

export function clearObstacles(controls: V3[], outerMm: number, obstacles: WireObstacle[]): V3[] {
  if (controls.length < 2) return controls
  const out = controls.map((point) => [...point] as V3)
  const frontZ = wireFrontLimit(outerMm)
  for (let index = 1; index < out.length - 1; index += 1) out[index][2] = Math.max(out[index][2], frontZ)
  // Calhas técnicas são canais abertos de cabos; parede do fundo já fica atrás de `frontZ`.
  const activeObstacles = obstacles.filter((box) => !box.rail && !box.duct && box.enclosureWall !== 'back')
  if (activeObstacles.length === 0) return out
  const pad = (outerMm / 2) * U + 0.048
  const grown = activeObstacles.map((box) => {
    const expanded = box.clone().expandByScalar(pad) as WireObstacle
    if (box.hard && !box.enclosureWall) expanded.expandByScalar(0.018)
    expanded.hard = box.hard
    expanded.enclosureWall = box.enclosureWall
    expanded.componentId = box.componentId
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
        // Paredes do armário: recua o ponto para DENTRO do quadro (nunca atira o cabo para fora pela frente!).
        if (box.enclosureWall) {
          for (const idx of [index, index + 1]) {
            if (idx <= 0 || idx >= out.length - 1) continue
            const p = out[idx]
            if (box.enclosureWall === 'left' && p[0] < box.max.x + 0.02) { p[0] = box.max.x + 0.02; changed = true }
            else if (box.enclosureWall === 'right' && p[0] > box.min.x - 0.02) { p[0] = box.min.x - 0.02; changed = true }
            else if (box.enclosureWall === 'bottom' && p[1] < box.max.y + 0.02) { p[1] = box.max.y + 0.02; changed = true }
            else if (box.enclosureWall === 'top' && p[1] > box.min.y - 0.02) { p[1] = box.min.y - 0.02; changed = true }
            else if (box.enclosureWall === 'door' && !(box instanceof OrientedWireBox) && p[2] > box.min.z - 0.02) {
              p[2] = Math.max(frontZ, box.min.z - 0.02); changed = true
            }
          }
          continue
        }
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

/** Afastamento lateral entre cabos paralelos no mesmo corredor (maior = menos sobreposição visual). */
const trunkSpread = (wire: Wire): number => ((wireHash(wire) % 11) - 5) * 0.034
/** Camadas em profundidade (Z) para cabos que partilham o mesmo plano. */
const trunkLayer = (wire: Wire): number => Math.floor(wireHash(wire) / 11) % 4

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
  /** Posição ordenada do cabo no chicote da porta (`0..doorTotal-1`). */
  doorSlot?: number
  doorTotal?: number
  /** Posição ordenada do cabo no chicote do motor (`0..motorTotal-1`). */
  motorSlot?: number
  motorTotal?: number
}

export type TrunkPlan = {
  laneA: number
  laneB: number
  riserX?: number
  /** Verdadeiro quando o troço corre dentro de calha técnica ranhurada real (`CT1..CT5`). */
  inDuct?: boolean
  /** ID do quadro onde ambos os extremos estão montados. */
  enclosureId?: string
  slot?: WireSlotOverride
}

/**
 * Borne na face da frente (ou de trás) com a calha abaixo/acima do aparelho: o cabo desce à frente só
 * até sair do aparelho e daí recua em diagonal até à calha, como um cabo real a entrar na canaleta.
 * Sem isto, descia a direito à frente até à calha e dobrava 90° para trás (visto de frente, um «U»).
 * Devolve o ponto onde começa a recuar, ou null se não se aplicar.
 */
function frontBackOff(end: V3, lead: V3 | null | undefined, laneY: number, x: number, zVert: number, outerMm: number, obstacles: WireObstacle[]): V3 | null {
  if (!lead || Math.abs(lead[2]) < 0.7) return null
  const near = 0.02
  const own = obstacles
    .filter((box) => !box.rail && !box.hard
      && end[0] >= box.min.x - near && end[0] <= box.max.x + near
      && end[1] >= box.min.y - near && end[1] <= box.max.y + near
      && end[2] >= box.min.z - near && end[2] <= box.max.z + near)
    .sort((p, q) => p.getSize(new THREE.Vector3()).lengthSq() - q.getSize(new THREE.Vector3()).lengthSq())[0]
  if (!own) return null
  // Fora da margem que `clearObstacles` dá aos aparelhos (meio diâmetro + 5,2 mm), com folga.
  const clear = (outerMm / 2) * U + 0.052 + 0.02
  const yClear = laneY < own.min.y - clear ? own.min.y - clear : laneY > own.max.y + clear ? own.max.y + clear : null
  if (yClear === null || Math.abs(yClear - laneY) < 0.05) return null
  return [x, yClear, zVert]
}

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
  // Saída axial mais longa a partir da ponteira: dá espaço para a curva não “partir”.
  const leadStep = Math.max(outerMm * 4.8 * U, 0.085)

  if (manual.length > 0) {
    // Se a primeira/última perna manual faz ângulo agudo (> 82°) com o eixo da ponteira,
    // insere uma saída axial curta para a curva nunca «partir» na boca da ponteira.
    const isProbe = endTypeOf(wire, 'from') === 'probe' || endTypeOf(wire, 'to') === 'probe'
    const startStub: V3[] = []
    const endStub: V3[] = []
    if (!isProbe && leads.a) {
      const firstDir = v(manual[0]).sub(v(a))
      const firstLen = firstDir.length()
      const la = v(leads.a)
      if (firstLen > leadStep * 2.2 && la.lengthSq() > 0.25 && firstDir.normalize().dot(la.normalize()) < 0.14) {
        const s = v(a).addScaledVector(la, Math.min(leadStep * 0.72, firstLen * 0.28))
        startStub.push([s.x, s.y, Math.max(frontZ, s.z)])
      }
    }
    if (!isProbe && leads.b) {
      const last = manual[manual.length - 1]
      const lastDir = v(last).sub(v(b))
      const lastLen = lastDir.length()
      const lb = v(leads.b)
      if (lastLen > leadStep * 2.2 && lb.lengthSq() > 0.25 && lastDir.normalize().dot(lb.normalize()) < 0.14) {
        const s = v(b).addScaledVector(lb, Math.min(leadStep * 0.72, lastLen * 0.28))
        endStub.push([s.x, s.y, Math.max(frontZ, s.z)])
      }
    }
    controls = [a, ...startStub, ...manual, ...endStub, b]
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
    // Ligação curta (ponte entre bornes vizinhos): U compacto, proporcional ao cabo, em vez dos 82 mm dos percursos longos.
    const shortLink = v(a).distanceTo(v(b)) < 0.6
    const drop = shortLink
      ? -Math.max(0.28, leadStep * 2.4)
      : -0.82 - Math.min(0.85, Math.abs(a[0] - b[0]) * 0.05)
    let channelY = THREE.MathUtils.lerp(a[1], b[1], Math.max(0, Math.min(1, wire.bend ?? 0.5))) + drop
    if (trunkY !== undefined) channelY = trunkY + trunkSpread(wire)

    if (wire.route === 'arc') {
      const midZ = Math.max((a[2] + b[2]) / 2, frontZ + 0.04)
      const mid: V3 = [(a[0] + b[0]) / 2, channelY + (wire.curveOffset ?? 0) * 0.01, midZ]
      controls = [a, mid, b]
    } else if (plan) {
      const slot = plan.slot
      const fallbackLayerZ = trunkY !== undefined ? trunkLayer(wire) * (outerMm * 0.01 * 2.1) : 0
      const ductZA = slot?.ductZA ?? (frontZ + 0.018 + fallbackLayerZ)
      const ductZB = slot?.ductZB ?? (frontZ + 0.018 + fallbackLayerZ)
      const yA = plan.laneA + (slot?.yOffsetA ?? trunkSpread(wire))
      const yB = plan.laneB + (slot?.yOffsetB ?? trunkSpread(wire))

      // Saída axial suave a partir de cada ponteira (proporcional à distância ao corredor, para não ultrapassar a calha e fazer laço em «S»).
      const rawStepA = leads.a && Math.abs(leads.a[1]) > 0.7
        ? Math.min(leadStep, Math.max(0.045, Math.abs(yA - a[1]) * 0.42))
        : leadStep
      const rawStepB = leads.b && Math.abs(leads.b[1]) > 0.7
        ? Math.min(leadStep, Math.max(0.045, Math.abs(yB - b[1]) * 0.42))
        : leadStep
      // Se o borne está no interior/traseira da própria caixa (ex.: sinalizador H1/H2/H3, botoneira B0) e sai na vertical,
      // prolonga a saída axial até sair da face da caixa antes de inclinar em Z — elimina qualquer retrocesso de 180°!
      const clearOwnExitY = (pt: V3, lead: V3 | null | undefined, targetY: number, fallback: number): number => {
        if (!lead || Math.abs(lead[1]) <= 0.7) return pt[1] + (lead?.[1] ?? 0) * fallback
        let yExit = pt[1] + lead[1] * fallback
        const clearPad = outerMm * U * 2.6 + 0.042
        for (const box of obstacles) {
          if (box.rail || box.duct || box.enclosureWall) continue
          if (pt[0] < box.min.x - 0.03 || pt[0] > box.max.x + 0.03 || pt[1] < box.min.y || pt[1] > box.max.y || pt[2] < box.min.z - 0.12 || pt[2] > box.max.z + 0.06) continue
          if (lead[1] < 0 && targetY < box.min.y - clearPad) yExit = Math.min(yExit, Math.max(targetY + 0.015, box.min.y - clearPad))
          else if (lead[1] > 0 && targetY > box.max.y + clearPad) yExit = Math.max(yExit, Math.min(targetY - 0.015, box.max.y + clearPad))
        }
        return yExit
      }
      const clearOwnExitZ = (pt: V3, lead: V3 | null | undefined, fallback: number): number => {
        const base = Math.max(frontZ, pt[2] + (lead?.[2] ?? 0) * fallback)
        if (!lead || lead[2] <= 0.7) return base
        let zExit = base
        const clearPad = outerMm * U * 2.6 + 0.048
        for (const box of obstacles) {
          if (box.rail || box.duct || box.enclosureWall) continue
          if (pt[0] < box.min.x - 0.02 || pt[0] > box.max.x + 0.02 || pt[1] < box.min.y - 0.02 || pt[1] > box.max.y + 0.02 || pt[2] < box.min.z - 0.04 || pt[2] > box.max.z + 0.04) continue
          zExit = Math.max(zExit, box.max.z + clearPad)
        }
        return zExit
      }
      const exitA: V3 = leads.a
        ? [a[0] + leads.a[0] * rawStepA, clearOwnExitY(a, leads.a, yA, rawStepA), clearOwnExitZ(a, leads.a, rawStepA)]
        : a
      const exitB: V3 = leads.b
        ? [b[0] + leads.b[0] * rawStepB, clearOwnExitY(b, leads.b, yB, rawStepB), clearOwnExitZ(b, leads.b, rawStepB)]
        : b

      // Evita «gancho invertido» quando a faixa fica ligeiramente atrás da saída axial superior/inferior.
      const effYA = leads.a && leads.a[1] > 0.65 && yA < exitA[1] + 0.035 && !plan.inDuct
        ? exitA[1] + 0.045
        : leads.a && leads.a[1] < -0.65 && yA > exitA[1] - 0.035 && !plan.inDuct
          ? exitA[1] - 0.045
          : yA
      const effYB = leads.b && leads.b[1] > 0.65 && yB < exitB[1] + 0.035 && !plan.inDuct
        ? exitB[1] + 0.045
        : leads.b && leads.b[1] < -0.65 && yB > exitB[1] - 0.035 && !plan.inDuct
          ? exitB[1] - 0.045
          : yB

      // Em calha técnica real (`plan.inDuct`), o fio desce do borne diretamente para a profundidade interior da calha;
      // em painel aberto, sobe num plano vertical frontal limpo acima das pistas horizontais para nunca cruzar X vs Y.
      const baseVertZ = plan.inDuct ? Math.max(ductZA, ductZB) + 0.032 : Math.max(ductZA, ductZB) + 0.056
      const zVertA = Math.max(exitA[2], slot?.vertZA ?? baseVertZ)
      const zVertB = Math.max(exitB[2], slot?.vertZB ?? baseVertZ)
      const xA = exitA[0] + (slot?.xStepA ?? 0)
      const xB = exitB[0] + (slot?.xStepB ?? 0)

      const backA = frontBackOff(a, leads.a, effYA, xA, zVertA, outerMm, obstacles)
      const backB = frontBackOff(b, leads.b, effYB, xB, zVertB, outerMm, obstacles)
      // Se o borne já sai na vertical (+Y/-Y) e não há obstáculo entre o borne e o corredor,
      // transita suavemente em Z durante o troço vertical (elimina duplos cotovelos feios à entrada do corredor).
      const directDropA = !backA && Math.abs(xA - exitA[0]) < 1e-4 && Boolean(leads.a && Math.abs(leads.a[1]) > 0.75) && Math.abs(effYA - exitA[1]) > 0.28
      const directDropB = !backB && Math.abs(xB - exitB[0]) < 1e-4 && Boolean(leads.b && Math.abs(leads.b[1]) > 0.75) && Math.abs(effYB - exitB[1]) > 0.28
      const midDropYA = exitA[1] + (effYA - exitA[1]) * 0.72
      const midDropYB = exitB[1] + (effYB - exitB[1]) * 0.72
      const startChain: V3[] = directDropA
        ? [
          a,
          ...(v(exitA).distanceTo(v(a)) > 1e-4 ? [exitA] : []),
          [xA, midDropYA, zVertA],
          [xA, effYA, ductZA],
        ]
        : [
          a,
          ...(v(exitA).distanceTo(v(a)) > 1e-4 ? [exitA] : []),
          ...(Math.abs(xA - exitA[0]) > 1e-4
            ? [[xA, exitA[1] + (effYA - exitA[1]) * 0.28, zVertA] as V3]
            : Math.abs(zVertA - exitA[2]) > 0.025 && Math.abs(effYA - exitA[1]) > 0.24
              ? [[xA, exitA[1] + (effYA - exitA[1]) * 0.55, zVertA] as V3]
              : []),
          backA ?? [xA, effYA, zVertA],
          [xA, effYA, ductZA],
        ]
      const endChain: V3[] = directDropB
        ? [
          [xB, effYB, ductZB],
          [xB, midDropYB, zVertB],
          ...(v(exitB).distanceTo(v(b)) > 1e-4 ? [exitB] : []),
          b,
        ]
        : [
          [xB, effYB, ductZB],
          backB ?? [xB, effYB, zVertB],
          ...(Math.abs(xB - exitB[0]) > 1e-4
            ? [[xB, exitB[1] + (effYB - exitB[1]) * 0.28, zVertB] as V3]
            : Math.abs(zVertB - exitB[2]) > 0.025 && Math.abs(effYB - exitB[1]) > 0.24
              ? [[xB, exitB[1] + (effYB - exitB[1]) * 0.55, zVertB] as V3]
              : []),
          ...(v(exitB).distanceTo(v(b)) > 1e-4 ? [exitB] : []),
          b,
        ]

      if (plan.riserX === undefined || Math.abs(plan.laneA - plan.laneB) < 1e-6) {
        if (Math.abs(ductZA - ductZB) < 1e-4 && Math.abs(effYA - effYB) < 1e-4) {
          controls = [...startChain, ...endChain]
        } else {
          const midX = (xA + xB) * 0.5
          controls = [...startChain, [midX, effYA, ductZA], [midX, effYB, ductZB], ...endChain]
        }
      } else {
        const rx = plan.riserX + (slot?.riserXOffset ?? 0)
        const zRiser = slot?.riserZ ?? (plan.inDuct ? Math.max(ductZA, ductZB) + 0.024 : Math.max(baseVertZ, ductZA + 0.044, ductZB + 0.044))
        controls = [
          ...startChain,
          [rx, effYA, ductZA],
          ...(Math.abs(zRiser - ductZA) > 0.008 ? [[rx, effYA, zRiser] as V3] : []),
          [rx, effYB, zRiser],
          ...(Math.abs(zRiser - ductZB) > 0.008 ? [[rx, effYB, ductZB] as V3] : []),
          ...endChain,
        ]
      }
    } else {
      const fallbackLayerZ = trunkY !== undefined ? trunkLayer(wire) * (outerMm * 0.01 * 2.1) : 0
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
    controls = removeWireBacktracks(coalesceShortJogs(controls, Math.max(outerMm * 2.4, 7) * U))
  }

  // Ortogonalizar e impedir diagonais longas (comum quando o path colapsa a 2 pontos).
  if (manual.length === 0 && wire.route !== 'arc' && wire.route !== 'direct') {
    controls = ensureDetoured(controls, outerMm)
  }

  if (smooth && controls.length > 2) {
    // Tubos fluidos: mais amostras + tensão suave → sem vincos nas curvas
    const fluid = wire.kind === 'hydraulic' || wire.kind === 'pneumatic'
    const tension = fluid ? 0.35 : 0.22
    const samples = fluid ? Math.max(96, controls.length * 40) : Math.max(64, controls.length * 28)
    const curve = new THREE.CatmullRomCurve3(controls.map(v), false, 'centripetal', tension)
    return keepInFrontOfPlate(curve.getPoints(samples).map(arr), outerMm)
  }
  if (controls.length <= 2 && wire.route !== 'direct') {
    controls = ensureDetoured(controls, outerMm)
  }
  if (controls.length <= 2) return keepInFrontOfPlate(controls, outerMm)
  const fluid = wire.kind === 'hydraulic' || wire.kind === 'pneumatic'
  // Raios maiores em tubos PU/hidráulicos evitam cotovelos em «V» (vincos)
  const radiusFactor = fluid ? 14.5 : (wire.flexibility === 'flexible' ? 10.5 : 8.2)
  let rounded = roundCorners(controls, outerMm, radiusFactor)
  if (fluid && rounded.length > 3) {
    rounded = smoothSharpCorners(rounded, outerMm * 1.35, 0.12)
  }
  return keepInFrontOfPlate(rounded, outerMm)
}

/* ------------------------------------------------------- máquinas (obstáculos duros) */

const HARD_CLEARANCE = 0.12
const HARD_END_SKIRT = 0.56

function hardHits(points: V3[], hard: WireObstacle[], ends: V3[]): number {
  const realHard = hard.filter((box) => !box.duct && box.enclosureWall !== 'back' && !(box instanceof OrientedWireBox && box.enclosureWall === 'door'))
  if (realHard.length === 0) return 0
  let hits = 0
  const p = new THREE.Vector3()
  for (const box of realHard) {
    const clear = box.enclosureWall ? 0.04 : HARD_CLEARANCE
    const own = ends.filter((end) => end[0] > box.min.x - 0.1 && end[0] < box.max.x + 0.1 && end[1] > box.min.y - 0.1 && end[1] < box.max.y + 0.1 && end[2] > box.min.z - 0.1 && end[2] < box.max.z + 0.1)
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = v(points[i])
      const b = v(points[i + 1])
      for (let step = 0; step <= 16; step += 1) {
        p.lerpVectors(a, b, step / 16)
        if (p.x <= box.min.x - clear || p.x >= box.max.x + clear || p.y <= box.min.y - clear || p.y >= box.max.y + clear) continue
        if (box.enclosureWall && (p.z <= box.min.z - 0.02 || p.z >= box.max.z + 0.02)) continue
        if (own.some((end) => Math.hypot(end[0] - p.x, end[1] - p.y, end[2] - p.z) < HARD_END_SKIRT)) continue
        hits += 1
      }
    }
  }
  return hits
}

type EnclosureVolume = { id: string; minX: number; maxX: number; minY: number; maxY: number; backZ: number; frontZ: number }

function enclosureVolumesOf(obstacles: WireObstacle[]): EnclosureVolume[] {
  const byId = new Map<string, EnclosureVolume>()
  for (const b of obstacles) {
    if (!b.enclosureWall || !b.componentId || b.enclosureWall === 'door') continue
    const cur = byId.get(b.componentId)
    if (!cur) {
      byId.set(b.componentId, { id: b.componentId, minX: b.min.x, maxX: b.max.x, minY: b.min.y, maxY: b.max.y, backZ: b.min.z, frontZ: b.max.z })
    } else {
      cur.minX = Math.min(cur.minX, b.min.x); cur.maxX = Math.max(cur.maxX, b.max.x)
      cur.minY = Math.min(cur.minY, b.min.y); cur.maxY = Math.max(cur.maxY, b.max.y)
      cur.backZ = Math.min(cur.backZ, b.min.z); cur.frontZ = Math.max(cur.frontZ, b.max.z)
    }
  }
  return [...byId.values()]
}

function enclosureContainingPoint(pt: V3, enclosures: EnclosureVolume[], explicitId?: string): EnclosureVolume | undefined {
  if (explicitId) {
    const found = enclosures.find((e) => e.id === explicitId)
    if (found) return found
  }
  return enclosures.find((e) => pt[0] >= e.minX - 0.02 && pt[0] <= e.maxX + 0.02 && pt[1] >= e.minY - 0.02 && pt[1] <= e.maxY + 0.02)
}

/** Determina se o borne fica no topo (+1), na base (-1) ou neutro (0) do respetivo aparelho. */
function terminalVerticalBias(end: WireEndpoint3D): -1 | 0 | 1 {
  const ny = end.normal?.[1] ?? 0
  const nz = end.normal?.[2] ?? 0
  if (ny > 0.45) return 1
  if (ny < -0.45) return -1
  // Comandos montados na porta: os cabos traseiros descem para o corredor
  // entre filas, em vez de contornarem a fila inteira por cima das lâmpadas.
  if (nz < -0.35) return -1
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
  enclosure?: EnclosureVolume,
): { plan: TrunkPlan; hint: number } | undefined {
  const hard = obstacles.filter((box) => box.hard && !box.rail && !box.duct && box.enclosureWall !== 'back' && !(box instanceof OrientedWireBox && box.enclosureWall === 'door'))
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
  for (const d of obstacles) {
    if (d.duct && d.ductAxis === 'y') xs.add((d.min.x + d.max.x) * 0.5)
  }
  const sortedSoft = [...soft].sort((a, b) => a.min.x - b.min.x)
  let reach = -Infinity
  for (const box of sortedSoft) {
    if (reach !== -Infinity && box.min.x - reach >= 0.075) xs.add((reach + box.min.x) / 2)
    reach = Math.max(reach, box.max.x)
  }
  const softMinX = sortedSoft.length > 0 ? sortedSoft[0].min.x : -Infinity
  const softMaxX = sortedSoft.length > 0 ? reach : Infinity
  if (sortedSoft.length > 0) { xs.add(softMinX - 0.18); xs.add(softMaxX + 0.18) }
  for (const box of hard) {
    if (box.enclosureWall) continue
    xs.add(box.min.x - 0.18); xs.add(box.max.x + 0.18)
  }
  if (enclosure) {
    for (const x of [...xs]) {
      if (x < enclosure.minX + 0.12 || x > enclosure.maxX - 0.12) xs.delete(x)
    }
    xs.add(enclosure.minX + 0.18)
    xs.add(enclosure.maxX - 0.18)
  }

  const wrongSide = (end: WireEndpoint3D, lane: number) => {
    const bias = terminalVerticalBias(end)
    return (bias > 0 && lane < end.position[1] - 0.02) || (bias < 0 && lane > end.position[1] + 0.02) ? 1 : 0
  }
  const validLanes = enclosure
    ? lanes.filter((l) => l >= enclosure.minY + 0.09 && l <= enclosure.maxY - 0.11)
    : lanes
  let best: { plan: TrunkPlan; hint: number; score: number } | undefined
  for (const laneA of validLanes) {
    if (wrongSide(from, laneA)) continue
    for (const laneB of validLanes) {
      if (wrongSide(to, laneB)) continue
      const risers: Array<number | undefined> = Math.abs(laneA - laneB) < 1e-6 ? [undefined] : [...xs]
      for (const riserX of risers) {
        const plan: TrunkPlan = riserX === undefined
          ? { laneA, laneB, inDuct: base?.inDuct, enclosureId: enclosure?.id }
          : { laneA, laneB, riserX, inDuct: base?.inDuct, enclosureId: enclosure?.id }
        const { cost, hits } = evaluate(plan, laneA)
        if (hits > 0) continue
        const extPenalty = !enclosure && riserX !== undefined && (riserX < softMinX - 0.05 || riserX > softMaxX + 0.05) ? 95 : 0
        const score = cost + extPenalty
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
  // Ponte no mesmo aparelho: jumper curto entre bornes vizinhos.
  if (from.componentId === to.componentId && from.position.some((n, i) => Number.isFinite(n) && Number.isFinite(to.position[i]))) return {}
  // Cabos ligados a aparelhos na porta têm o seu próprio chicote industrial (`buildDoorHarnessBody3D`).
  if (from.doorContext || to.doorContext) return {}
  const solidObstacles = obstacles.filter((box) => !box.rail)
  if (wire.waypoints3D?.length || solidObstacles.length === 0 || wire.route === 'direct' || wire.route === 'arc') {
    return {}
  }

  const enclosures = enclosureVolumesOf(obstacles)
  const encA = enclosureContainingPoint(from.position, enclosures, from.enclosureId)
  const encB = enclosureContainingPoint(to.position, enclosures, to.enclosureId)
  const sharedEnc = encA && encB && encA.id === encB.id ? encA : undefined

  // ── Caso 1: Quadro com calhas técnicas ranhuradas (`cableDuct`, ex.: CT1..CT5) ──
  // Todos os cabos interiores correm dentro das calhas horizontais e transferem pelas calhas verticais!
  if (sharedEnc) {
    const insideEnc = (b: WireObstacle) =>
      b.max.x > sharedEnc.minX && b.min.x < sharedEnc.maxX && b.max.y > sharedEnc.minY && b.min.y < sharedEnc.maxY
    const hDucts = obstacles
      .filter((b) => b.duct && b.ductAxis === 'x' && insideEnc(b))
      .map((b) => (b.min.y + b.max.y) * 0.5)
      .sort((a, b) => a - b)
    const vDucts = obstacles
      .filter((b) => b.duct && b.ductAxis === 'y' && insideEnc(b))
      .map((b) => (b.min.x + b.max.x) * 0.5)
      .sort((a, b) => a - b)

    if (hDucts.length > 0) {
      // Corredor inferior compacto entre a régua de bornes inferior (ex.: TR4/X1/X2) e o fundo do quadro:
      // fica abaixo de `bottomRowMinY` quando há folga; se não houver, usa a calha horizontal inferior (CT3).
      const lowestDuct = hDucts[0]
      const bottomTrough = sharedEnc.minY + 0.14
      const pickDuctLane = (end: WireEndpoint3D): number => {
        const y = end.position[1]
        const bias = terminalVerticalBias(end)
        if (bias < 0 && y < lowestDuct - 0.35 && bottomTrough < y - 0.08) return bottomTrough
        const preferred = bias > 0
          ? hDucts.filter((d) => d >= y - 0.02)
          : bias < 0
            ? hDucts.filter((d) => d <= y + 0.02)
            : hDucts
        const pool = preferred.length > 0 ? preferred : hDucts
        return pool.reduce((best, d) => (Math.abs(d - y) < Math.abs(best - y) ? d : best), pool[0])
      }
      const laneA = pickDuctLane(from)
      const laneB = pickDuctLane(to)
      // Ligação direta de curta distância entre aparelho e relé encaixado (ex.: KM1.2T1 → RT1.1L1): sem ir à calha vertical.
      if (Math.abs(laneA - laneB) < 1e-6) {
        return { trunkHint: laneA, plan: { laneA, laneB, inDuct: true, enclosureId: sharedEnc.id } }
      }
      const riserPool = vDucts.length > 0 ? vDucts : [sharedEnc.minX + 0.22, sharedEnc.maxX - 0.22]
      const riserX = riserPool.reduce((best, rx) => {
        const costR = Math.abs(from.position[0] - rx) + Math.abs(to.position[0] - rx)
        const costB = Math.abs(from.position[0] - best) + Math.abs(to.position[0] - best)
        return costR < costB ? rx : best
      }, riserPool[0])
      return { trunkHint: laneA, plan: { laneA, laneB, riserX, inDuct: true, enclosureId: sharedEnc.id } }
    }
  }

  // ── Caso 2: Painel aberto (ex.: «Partida direta») ou quadro sem calhas técnicas ──
  const softBoxes = solidObstacles.filter((box) => !box.hard)
  const hardBoxes = solidObstacles.filter((box) => box.hard && !box.duct && !box.enclosureWall)
  const boxA = from.componentId ? softBoxes.find((b) => b.componentId === from.componentId) : undefined
  const boxB = to.componentId ? softBoxes.find((b) => b.componentId === to.componentId) : undefined

  // Ponte trifásica / cascata compacta entre dois aparelhos vizinhos na mesma calha DIN
  // (ex.: QG.2/4/6 → QM1.1/3/5, QM1.2/4/6 → KM1.1L1/3L2/5L3, XG.L1/L2/L3 → QG.1/3/5):
  // usa uma crista superior dedicada e baixa (+19 mm acima dos disjuntores) em vez de subir 75 mm até ao comando!
  if (!sharedEnc && boxA && boxB && wire.kind === 'power') {
    const biasA = terminalVerticalBias(from)
    const biasB = terminalVerticalBias(to)
    const sameRailBand = Math.abs((boxA.min.y + boxA.max.y) * 0.5 - (boxB.min.y + boxB.max.y) * 0.5) < 0.42
    const horizDist = Math.max(0, Math.max(boxA.min.x - boxB.max.x, boxB.min.x - boxA.max.x))
    const localTop = Math.round((Math.max(boxA.max.y, boxB.max.y) + 0.19) * 100) / 100
    const localBot = Math.round((Math.min(boxA.min.y, boxB.min.y) - 0.15) * 100) / 100
    if (sameRailBand && horizDist < 0.72) {
      if (biasA > 0 && biasB > 0) {
        return { trunkHint: localTop, plan: { laneA: localTop, laneB: localTop } }
      }
      if (biasA < 0 && biasB > 0 && horizDist >= 0.16) {
        const gapX = boxA.max.x <= boxB.min.x ? (boxA.max.x + boxB.min.x) * 0.5 : (boxB.max.x + boxA.min.x) * 0.5
        return { trunkHint: localBot, plan: { laneA: localBot, laneB: localTop, riserX: gapX } }
      }
      if (biasA > 0 && biasB < 0 && horizDist >= 0.16) {
        const gapX = boxA.max.x <= boxB.min.x ? (boxA.max.x + boxB.min.x) * 0.5 : (boxB.max.x + boxA.min.x) * 0.5
        return { trunkHint: localTop, plan: { laneA: localTop, laneB: localBot, riserX: gapX } }
      }
    }
  }

  let lanes = [
    ...new Set([
      ...trunkLaneHints(softBoxes),
      ...hardBoxes.map((box) => box.max.y + 0.30),
    ]),
  ].sort((a, b) => a - b)
  if (sharedEnc) {
    lanes = lanes.filter((l) => l >= sharedEnc.minY + 0.10 && l <= sharedEnc.maxY - 0.12)
    if (lanes.length === 0) lanes = [(sharedEnc.minY + sharedEnc.maxY) * 0.5]
  }
  if (lanes.length === 0) return {}

  // Garante folga axial acima/abaixo do próprio aparelho (elimina nós apertados no topo da fonte PS1).
  const chooseCleanLane = (end: WireEndpoint3D, own: WireObstacle | undefined): number => {
    const bias = terminalVerticalBias(end)
    if (own && bias > 0) {
      const clearAbove = lanes.filter((l) => l >= own.max.y + 0.12)
      if (clearAbove.length > 0) return clearAbove[0]
    }
    if (own && bias < 0) {
      const clearBelow = lanes.filter((l) => l <= own.min.y - 0.10)
      if (clearBelow.length > 0) return clearBelow[clearBelow.length - 1]
    }
    return chooseLaneForEndpoint(end, lanes)
  }

  const laneA = chooseCleanLane(from, boxA)
  const laneB = chooseCleanLane(to, boxB)
  let trunkHint = laneA
  let plan: TrunkPlan = { laneA, laneB, enclosureId: sharedEnc?.id }

  if (Math.abs(laneA - laneB) > 1e-6) {
    const lo = Math.min(laneA, laneB)
    const hi = Math.max(laneA, laneB)
    const riserClearance = 0.18
    const between = softBoxes
      .filter((box) => box.max.y > lo + 0.02 && box.min.y < hi - 0.02)
      .sort((a, b) => a.min.x - b.min.x)
    const midX = (from.position[0] + to.position[0]) / 2
    if (between.length > 0) {
      const extLeft = between[0].min.x - riserClearance
      const extRight = Math.max(...between.map((box) => box.max.x)) + riserClearance
      let candidates: number[] = [extLeft, extRight]
      let reach = between[0].max.x
      for (let i = 1; i < between.length; i += 1) {
        if (between[i].min.x - reach >= 0.075) {
          candidates.push((reach + between[i].min.x) / 2)
        }
        reach = Math.max(reach, between[i].max.x)
      }
      if (sharedEnc) {
        candidates = candidates.filter((cx) => cx >= sharedEnc.minX + 0.12 && cx <= sharedEnc.maxX - 0.12)
        if (!candidates.length) candidates = [sharedEnc.minX + 0.18, sharedEnc.maxX - 0.18]
      }
      // Escolhe a passagem vertical que minimiza o comprimento total |xA - cx| + |xB - cx|,
      // preferindo fendas interiores entre aparelhos a voltas largas por fora das extremidades da calha.
      const riserCost = (cx: number) =>
        Math.abs(from.position[0] - cx) + Math.abs(to.position[0] - cx)
        + (!sharedEnc && (cx === extLeft || cx === extRight) ? 0.55 : 0)
      plan.riserX = candidates.reduce((best, cx) => (riserCost(cx) < riserCost(best) ? cx : best), candidates[0])
    } else {
      plan.riserX = midX
    }
  }
  const around = planAroundMachines(wire, from, to, outerMm, obstacles, plan, trunkHint, lanes, sharedEnc)
  if (around) {
    plan = around.plan
    trunkHint = around.hint
  }
  return { trunkHint, plan }
}

/** Cantos em arco de círculo suave (mais subdivisões) sem vincos poligonais nem “partir”. */
export function roundCorners(points: V3[], outerMm: number, radiusFactor = 5.6): V3[] {
  if (points.length < 3) return points
  // Raio mínimo industrial generoso: evita cotovelos em «V» e ponteiras desalinhadas.
  const radius = Math.max(outerMm * radiusFactor, 18) * U
  const out: V3[] = [points[0]]
  const last = points.length - 1
  // Os dois arcos adjacentes partilham o mesmo segmento: os cortes nunca
  // podem somar mais do que o seu comprimento, ou o fio inverte e faz um bico.
  const cuts = points.map(() => 0)
  for (let i = 1; i < last; i++) {
    const before = v(points[i - 1]).sub(v(points[i]))
    const after = v(points[i + 1]).sub(v(points[i]))
    const lenBefore = before.length(), lenAfter = after.length()
    if (lenBefore < 1e-6 || lenAfter < 1e-6) continue
    const phi = before.angleTo(after)
    if (phi > Math.PI - 0.02 || phi < 0.02) continue
    cuts[i] = Math.min(radius / Math.tan(phi / 2), lenBefore * 0.9, lenAfter * 0.9)
  }
  for (let i = 1; i < last - 1; i++) {
    const length = v(points[i]).distanceTo(v(points[i + 1]))
    const sum = cuts[i] + cuts[i + 1]
    if (sum > length * 0.98) {
      const scale = length * 0.98 / sum
      cuts[i] *= scale
      cuts[i + 1] *= scale
    }
  }
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
    const cut = cuts[index]
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
    // Mais subdivisões → arco contínuo, sem facetagem que “parte” a curva.
    const steps = Math.max(16, Math.ceil(angle / 0.08))
    for (let step = 0; step <= steps; step += 1) {
      out.push(arr(center.clone().add(vs.clone().applyAxisAngle(axis, (angle * step) / steps))))
    }
  }
  out.push(points[last])
  return out
}

/**
 * Último passe do traçado: arredonda os cantos vivos que ficaram depois de contornar aparelhos,
 * separar cabos ou alinhar a abordagem às ponteiras (o «V» junto aos terminais). Só toca em
 * vértices que viram mais de ~17°; cada arco usa no máximo 45 % de cada segmento vizinho, por isso
 * os extremos e o troço reto alinhado com a ponteira mantêm-se.
 */
export function smoothSharpCorners(points: V3[], outerMm: number, minTurn = 0.22): V3[] {
  if (points.length < 3) return points
  const radius = Math.max(outerMm * 4.5, 12) * U
  const out: V3[] = [points[0]]
  let changed = false
  for (let i = 1; i < points.length - 1; i++) {
    const prev = v(points[i - 1]), corner = v(points[i]), next = v(points[i + 1])
    const a = prev.clone().sub(corner), b = next.clone().sub(corner)
    const la = a.length(), lb = b.length()
    // Segmentos abaixo de 0,4 mm: um arco aí não se vê e só gera ruído (mini-arcos dentro de arcos).
    if (Math.min(la, lb) < 0.4 * U) { out.push(points[i]); continue }
    const turn = Math.PI - a.angleTo(b)
    if (turn < minTurn) { out.push(points[i]); continue }
    const cut = Math.min(radius * Math.tan(turn / 2), la * 0.45, lb * 0.45)
    if (cut < 1e-5) { out.push(points[i]); continue }
    const start = corner.clone().addScaledVector(a.normalize(), cut)
    const end = corner.clone().addScaledVector(b.normalize(), cut)
    // Bézier quadrática com o canto como controlo: tangente contínua nos dois lados.
    const steps = Math.max(8, Math.ceil(turn / 0.07))
    for (let k = 0; k <= steps; k++) {
      const t = k / steps
      const p = start.clone().multiplyScalar((1 - t) * (1 - t)).addScaledVector(corner, 2 * (1 - t) * t).addScaledVector(end, t * t)
      out.push(arr(p))
    }
    changed = true
  }
  out.push(points[points.length - 1])
  return changed ? out : points
}

/** Remove voltas sobre o próprio segmento, tolerando apenas 0,01 mm de
 * erro numérico; não arredonda nem encurta desvios reais do percurso. */
export function removeWireBacktracks(points: V3[]): V3[] {
  const out: V3[] = []
  for (const point of points) {
    while (out.length >= 2) {
      const a = v(out[out.length - 2]), b = v(out[out.length - 1]), c = v(point)
      const ab = b.clone().sub(a), bc = c.clone().sub(b)
      if (ab.lengthSq() < 1e-14) { out.pop(); continue }
      if (bc.lengthSq() < 1e-14) break
      const perpendicular = ab.clone().cross(bc).length() / ab.length()
      if (ab.dot(bc) >= 0 || perpendicular > 1e-4) break
      out.pop()
    }
    if (!out.length || v(out[out.length - 1]).distanceToSquared(v(point)) > 1e-14) out.push(point)
  }
  return out
}

/** Arredonda só o troço exterior: o troço dentro do bucim (motorRoute) é fixo e conta-se pelo número de pontos. */
function smoothOutsideMotor(points: V3[], outerMm: number, motorRoute?: WirePath3D['motorRoute']): V3[] {
  const smooth = (pts: V3[], junctionAtEnd?: boolean) => {
    const clean = dropMicroSegments(pts, junctionAtEnd)
    const out = smoothSharpCorners(clean, outerMm)
    return out === pts ? pts : keepInFrontOfPlate(out, outerMm)
  }
  if (!motorRoute?.points.length) return smooth(points)
  const n = motorRoute.points.length
  if (n >= points.length) return points
  if (motorRoute.side === 'to') {
    const outer = points.slice(0, points.length - n + 1)
    const done = smooth(outer, true)
    return done === outer ? points : [...done.slice(0, -1), ...points.slice(points.length - n)]
  }
  const outer = points.slice(n - 1)
  const done = smooth(outer.slice().reverse(), true).reverse()
  return done.length === outer.length && done.every((p, i) => p === outer[i]) ? points : [...points.slice(0, n - 1), ...done]
}

/**
 * Tira pontos a menos de 0,1 mm do anterior (ruído numérico que torcia o tubo) e, quando o último ponto
 * é a junção com o troço fixo do motor, os pontos a menos de 3 mm dela — o cabo passava 1 mm além da
 * junção e voltava para trás (bico de ~170°). Extremos mantêm-se.
 */
function dropMicroSegments(points: V3[], junctionAtEnd = false): V3[] {
  if (points.length < 3) return points
  const min = 0.1 * U
  const out: V3[] = [points[0]]
  for (let i = 1; i < points.length - 1; i++) if (v(points[i]).distanceTo(v(out[out.length - 1])) > min) out.push(points[i])
  const last = points[points.length - 1]
  const guard = junctionAtEnd ? 3 * U : min
  while (out.length > 1 && v(out[out.length - 1]).distanceTo(v(last)) < guard) out.pop()
  out.push(last)
  // Bicos curtos (viragem acima de 90° com um segmento abaixo de 3 mm — depois dos arcos, uma curva
  // verdadeira vira menos de ~17° por vértice): retirar o vértice até não haver nenhum.
  for (let changed = true, guardLoop = 0; changed && guardLoop < 8; guardLoop++) {
    changed = false
    for (let i = 1; i < out.length - 1; i++) {
      const a = v(out[i]).sub(v(out[i - 1])), b = v(out[i + 1]).sub(v(out[i]))
      const la = a.length(), lb = b.length()
      if (la < 1e-9 || lb < 1e-9) continue
      if (a.angleTo(b) > Math.PI / 2 && Math.min(la, lb) < 6 * U) { out.splice(i, 1); changed = true; i-- }
    }
  }
  return out.length === points.length && out.every((p, i) => p === points[i]) ? points : out
}

/** A parte do trajeto dentro do bucim é fixa e não pode ser alterada. */
/**
 * Junção troço exterior ↔ troço fixo do bucim: se o exterior passa além da entrada e volta para
 * trás (bico acima de 90°), retira os últimos pontos exteriores até a viragem ficar suave.
 */
function smoothMotorJunction(points: V3[], motorRoute?: WirePath3D['motorRoute']): V3[] {
  const n = motorRoute?.points.length ?? 0
  if (!n || points.length < n + 2) return points
  const out = motorRoute!.side === 'to' ? points.slice() : points.slice().reverse()
  for (let guard = 0; guard < 6; guard++) {
    const j = out.length - n
    if (j < 2 || j + 1 >= out.length) break
    const a = v(out[j]).sub(v(out[j - 1])), b = v(out[j + 1]).sub(v(out[j]))
    if (a.length() < 1e-9 || b.length() < 1e-9 || a.angleTo(b) <= Math.PI / 2) break
    out.splice(j - 1, 1)
  }
  if (out.length === points.length) return points
  return motorRoute!.side === 'to' ? out : out.reverse()
}

/** Retira vértices em bico (viragem acima de 90°) do troço exterior; o troço fixo do bucim não muda. */
function despikeOutsideMotor(points: V3[], motorRoute?: WirePath3D['motorRoute']): V3[] {
  const n = motorRoute?.points.length ?? 0
  const ordered = n && motorRoute!.side === 'from' ? points.slice().reverse() : points.slice()
  const fixedFrom = n ? ordered.length - n : ordered.length - 1
  let changed = false
  for (let guard = 0; guard < 48; guard++) {
    let removed = false
    for (let i = 1; i < Math.min(fixedFrom + 1, ordered.length - 1); i++) {
      if (i === fixedFrom && n) continue // o primeiro ponto do troço fixo fica
      const a = v(ordered[i]).sub(v(ordered[i - 1])), b = v(ordered[i + 1]).sub(v(ordered[i]))
      if (a.length() < 1e-9 || b.length() < 1e-9 || a.angleTo(b) <= Math.PI / 2) continue
      ordered.splice(i, 1); removed = true; changed = true
      break
    }
    if (!removed) break
  }
  if (!changed) return points
  return n && motorRoute!.side === 'from' ? ordered.reverse() : ordered
}

function removeBacktracksOutsideMotor(points: V3[], motorRoute?: WirePath3D['motorRoute']): V3[] {
  if (!motorRoute?.points.length) return removeWireBacktracks(points)
  const n = motorRoute.points.length
  if (n >= points.length) return points
  if (motorRoute.side === 'to') return [...removeWireBacktracks(points.slice(0, points.length - n + 1)), ...points.slice(points.length - n + 1)]
  return [...points.slice(0, n - 1), ...removeWireBacktracks(points.slice(n - 1))]
}

function smoothMotorRouteJoin(points: V3[], motorRoute: NonNullable<WirePath3D['motorRoute']>): { points: V3[]; motorRoute: NonNullable<WirePath3D['motorRoute']> } {
  const reversed = motorRoute.side === 'from'
  const ordered = reversed ? points.slice().reverse() : points.slice()
  const n = motorRoute.points.length
  const join = ordered.length - n
  if (join < 2) return { points, motorRoute }

  let start = join - 1
  while (start > 1 && v(ordered[join]).distanceTo(v(ordered[start])) < 0.08) start--
  let end = join
  while (end < ordered.length - 2 && v(ordered[end]).distanceTo(v(ordered[join])) < 0.08) end++
  if (v(ordered[join]).distanceTo(v(ordered[start])) < 0.04 || v(ordered[end]).distanceTo(v(ordered[join])) < 0.04) return { points, motorRoute }

  const startDirection = v(ordered[start]).sub(v(ordered[start - 1])).normalize()
  const endDirection = v(ordered[end]).sub(v(ordered[end - 1])).normalize()
  const span = v(ordered[end]).distanceTo(v(ordered[start]))
  const reach = Math.min(0.04, span * 0.25)
  const curve = new THREE.CubicBezierCurve3(
    v(ordered[start]),
    v(ordered[start]).addScaledVector(startDirection, reach),
    v(ordered[end]).addScaledVector(endDirection, -reach),
    v(ordered[end]),
  ).getPoints(18).map(arr)
  const smoothed = [...ordered.slice(0, start), ...curve, ...ordered.slice(end + 1)]
  const routePoints = smoothed.slice(start)
  return {
    points: reversed ? smoothed.reverse() : smoothed,
    motorRoute: { side: motorRoute.side, points: reversed ? routePoints.reverse() : routePoints },
  }
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
  /** Aproximação validada ao bucim e aos bornes: não deformar nem atalhar. */
  motorRoute?: { side: 'from' | 'to'; points: V3[] }
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
  // Cabos de potência/comando permanentes passam pelo bucim M20.
  // Ponteiras e fichas do multímetro (probe / banana) não passam pelo bucim.
  return Boolean(end.motorContext && endType !== 'banana' && endType !== 'probe')
}

/**
 * Encaminha cabos de aparelhos montados na porta de um quadro (`door`/`doorOuter`)
 * formando um chicote real na face INTERIOR da porta → coluna vertical junto à dobradiça
 * → laço flexível de dobradiça → calha técnica vertical (`CT5`) → calha horizontal / régua de bornes.
 * Funciona com porta aberta ou fechada e dobradiça à esquerda ou à direita.
 */
function buildDoorHarnessBody3D(
  doorEnd: WireEndpoint3D,
  doorHead: V3,
  otherEnd: WireEndpoint3D,
  otherHead: V3,
  otherAxis: V3,
  outerMm: number,
  obstacles: WireObstacle[],
  slotIdx = 0,
  slotTotal = 1,
): V3[] {
  const dc = doorEnd.doorContext!
  const side = dc.hingeSide === 'right' ? 1 : -1
  const dir = -side // da dobradiça para o bordo livre da porta (+1 se dobradiça à esquerda)
  const halfW = (dc.widthMm * U) / 2
  const halfH = (dc.heightMm * U) / 2
  const depth = dc.depthMm * U
  const cx = dc.enclosurePivot[0]
  const cy = dc.enclosurePivot[1]
  const backZ = dc.enclosurePivot[2] - depth / 2
  const frontZ = backZ + depth
  const hingeX = cx + side * (halfW + 3 * U)
  const hingeZ = frontZ + 6 * U
  const openRad = dc.doorOpen ? THREE.MathUtils.degToRad(side * ENCLOSURE.openDeg) : 0
  const cosA = Math.cos(openRad), sinA = Math.sin(openRad)
  const plateMinZ = wireFrontLimit(outerMm)

  /** Converte coordenadas locais da porta (`dist` a partir da dobradiça, `y` mundial, `innerClear` para dentro da frente do quadro) em mundo 3D. */
  const doorPt = (dist: number, y: number, innerClear: number): V3 => {
    const lx = dir * dist
    const lz = (frontZ - innerClear) - hingeZ
    const wx = hingeX + lx * cosA + lz * sinA
    const wz = hingeZ - lx * sinA + lz * cosA
    return [wx, y, Math.max(plateMinZ, wz)]
  }
  /** Inverso: projeta um ponto mundial para `(dist, y, innerClear)` da porta. */
  const toDoor = (p: V3): { dist: number; y: number; inner: number } => {
    const dx = p[0] - hingeX, dz = p[2] - hingeZ
    const lx = dx * cosA - dz * sinA
    const lz = dx * sinA + dz * cosA
    return { dist: Math.max(0.18, lx * dir), y: p[1], inner: frontZ - (hingeZ + lz) }
  }

  const startLocal = toDoor(doorHead)
  // Organiza a secção do chicote numa fita compacta de 2 camadas (3,6 mm de passo → abraçadeiras PA66 justas!).
  const cols = Math.max(1, Math.min(6, Math.ceil(slotTotal / 2)))
  const col = slotIdx % cols
  const layer = Math.floor(slotIdx / cols)
  const innerLayer = 0.08 + layer * 0.036

  // Caso A: ponte porta → porta (ambos os aparelhos na mesma porta).
  if (otherEnd.doorContext && otherEnd.doorContext.enclosureId === dc.enclosureId) {
    const endLocal = toDoor(otherHead)
    const bridgeY = Math.min(startLocal.y, endLocal.y) - 0.24 - col * 0.034
    const pts: V3[] = [
      doorHead,
      doorPt(startLocal.dist, startLocal.y, innerLayer),
      doorPt(startLocal.dist, bridgeY, innerLayer),
      doorPt(endLocal.dist, bridgeY, innerLayer),
      doorPt(endLocal.dist, endLocal.y, innerLayer),
      otherHead,
    ]
    const dedup = pts.filter((p, i) => i === 0 || v(p).distanceTo(v(pts[i - 1])) > 1e-4)
    return keepInFrontOfPlate(roundCorners(dedup, outerMm, 5.2), outerMm)
  }

  // Caso B: aparelho na porta → borne interior do quadro.
  const spineDist = 0.42 + col * 0.034
  const branchY = Math.max(cy - halfH + 0.55, startLocal.y - 0.28 - (slotIdx % 4) * 0.032)

  // Procura as calhas técnicas no interior do armário.
  const insideEnc = (b: WireObstacle) =>
    b.max.x > cx - halfW && b.min.x < cx + halfW && b.max.y > cy - halfH && b.min.y < cy + halfH
  const vDucts = obstacles.filter((b) => b.duct && b.ductAxis === 'y' && insideEnc(b))
  const hDucts = obstacles.filter((b) => b.duct && b.ductAxis === 'x' && insideEnc(b))
    .map((b) => (b.min.y + b.max.y) * 0.5).sort((a, b) => a - b)
  const hingeDuctX = vDucts.length > 0
    ? vDucts.reduce((best, b) => {
      const bx = (b.min.x + b.max.x) * 0.5
      return Math.abs(bx - hingeX) < Math.abs(best - hingeX) ? bx : best
    }, (vDucts[0].min.x + vDucts[0].max.x) * 0.5)
    : cx + side * (halfW - 0.34)

  const otherBias = terminalVerticalBias(otherEnd)
  const lowestDuct = hDucts[0]
  const useBottomTrough = otherBias < 0 && (lowestDuct === undefined || otherHead[1] < lowestDuct - 0.32)
  // Calcula o fundo real de todos os aparelhos da régua inferior (ex.: QG1 + X1/X2) para passar limpo por baixo deles!
  const bottomRowBoxes = obstacles.filter((b) => !b.rail && !b.hard && insideEnc(b) && b.min.y < (lowestDuct ?? cy))
  const bottomRowMinY = bottomRowBoxes.length > 0 ? Math.min(...bottomRowBoxes.map((b) => b.min.y)) : otherHead[1]
  const bottomRowMaxZ = bottomRowBoxes.length > 0 ? Math.max(...bottomRowBoxes.map((b) => b.max.z)) : otherHead[2]
  const troughBot = cy - halfH + 0.095
  const troughTop = Math.min(otherHead[1] - 0.08, bottomRowMinY - 0.05)
  const targetLaneY = useBottomTrough
    ? (troughTop > troughBot + 0.03
      ? troughBot + ((col + 0.5) / Math.max(1, cols)) * (troughTop - troughBot)
      : cy - halfH + 0.115 + (col % 3) * 0.024)
    : hDucts.length > 0
      ? hDucts.reduce((best, d) => (Math.abs(d - otherHead[1]) < Math.abs(best - otherHead[1]) ? d : best), hDucts[0]) + (col - (cols - 1) * 0.5) * 0.032
      : otherHead[1] + (otherBias >= 0 ? 0.18 : -0.18) + (col - (cols - 1) * 0.5) * 0.032

  // Altura da passagem de dobradiça (no terço inferior da coluna da porta, alinhada com a calha inferior).
  const bridgeY = Math.max(cy - halfH + 0.85, Math.min(branchY - 0.45, (lowestDuct ?? cy - halfH + 1.1) + 0.18)) + (col - (cols - 1) * 0.5) * 0.018
  const ductInnerZ = plateMinZ + 0.135 + layer * 0.038
  // Se o corredor inferior passar rente a QG1, avança o troço horizontal à frente de QG1 para nunca lhe tocar!
  const bottomRunZ = useBottomTrough && troughTop <= troughBot + 0.03
    ? Math.max(ductInnerZ, bottomRowMaxZ + 0.055) + layer * 0.036
    : ductInnerZ
  const ductColX = hingeDuctX + (col - (cols - 1) * 0.5) * 0.032
  // Saída axial reta desde o borne (especialmente réguas PTI6 de 8,15 mm) até sair completamente do corpo do borne.
  const ownOther = obstacles.find((b) => b.componentId === otherEnd.componentId && !b.enclosureWall && !b.duct)
  const minAxial = ownOther && otherAxis[1] < -0.5
    ? Math.max(0.055, otherHead[1] - (ownOther.min.y - 0.045))
    : ownOther && otherAxis[1] > 0.5
      ? Math.max(0.055, (ownOther.max.y + 0.045) - otherHead[1])
      : 0.06
  const leadLen = Math.min(minAxial, Math.max(0.045, Math.abs(targetLaneY - otherHead[1]) - 0.02))
  const otherExit: V3 = [
    otherHead[0] + otherAxis[0] * leadLen,
    otherHead[1] + otherAxis[1] * leadLen,
    Math.max(plateMinZ, otherHead[2] + otherAxis[2] * leadLen),
  ]

  // Passagem de dobradiça: contorna a aba frontal da moldura (18 mm) em curva flexível contínua, sem tocar na chapa.
  const doorwayX = cx + side * (halfW - 0.30 - col * 0.032)
  const hingeCross: V3[] = dc.doorOpen
    ? [
      doorPt(Math.max(0.18, spineDist * 0.45), bridgeY, innerLayer),
      [doorwayX, bridgeY, frontZ + 0.12 + layer * 0.036],
      [ductColX, bridgeY, ductInnerZ + 0.20],
      [ductColX, bridgeY, ductInnerZ],
    ]
    : [
      [ductColX, bridgeY, frontZ - innerLayer],
      [ductColX, bridgeY, ductInnerZ],
    ]

  // Chegada ao borne: alinha em Z com o borne na calha inferior e sobe/desce axialmente sem tocar nos bornes vizinhos!
  const arriveZ = Math.max(plateMinZ + 0.12, otherExit[2])
  const pts: V3[] = [
    doorHead,
    doorPt(startLocal.dist, startLocal.y, innerLayer + 0.02),
    doorPt(startLocal.dist, branchY, innerLayer),
    doorPt(spineDist, branchY, innerLayer),
    doorPt(spineDist, bridgeY, innerLayer),
    ...hingeCross,
    [ductColX, targetLaneY, ductInnerZ],
    ...(Math.abs(bottomRunZ - ductInnerZ) > 0.02 ? [[ductColX, targetLaneY, bottomRunZ] as V3] : []),
    [otherExit[0], targetLaneY, bottomRunZ],
    ...(Math.abs(arriveZ - bottomRunZ) > 0.025 ? [[otherExit[0], targetLaneY, arriveZ] as V3] : []),
    otherExit,
    otherHead,
  ]
  const dedup = pts.filter((p, i) => i === 0 || v(p).distanceTo(v(pts[i - 1])) > 1e-4)
  return keepInFrontOfPlate(roundCorners(dedup, outerMm, 5.4), outerMm)
}

/**
 * Encaminha um cabo do quadro até ao borne do motor SEW
 * entrando axialmente pelo bucim M20 frontal (`MOTOR_GLAND`) da caixa de ligação.
 * Suporta tanto arranque direto (U1/V1/W1 + PE + sondas) como estrela-triângulo (U1/V1/W1 + W2/U2/V2 + PE)
 * e saída limpa pela chapa inferior de bucins quando o quadro é um armário (`panelEnclosure`).
 */
function buildMotorGlandBody3D(
  panelEnd: WireEndpoint3D,
  panelHead: V3,
  panelAxis: V3,
  motorEnd: WireEndpoint3D,
  motorHead: V3,
  motorAxis: V3,
  outerMm: number,
  obstacles: WireObstacle[],
  /** Pontos 3D desenhados pelo utilizador (do quadro para o motor): substituem o troço exterior automático. */
  manual: V3[] = [],
  slotOverride?: WireSlotOverride,
): { points: V3[]; entry: V3; enclosureGlandId?: string } {
  const ctx = motorEnd.motorContext
  if (!ctx) throw new Error('Motor gland routing requires motor context')
  const mPivot = v(ctx.pivot)
  const label = ctx.terminalLabel.toUpperCase()
  // Canais físicos distintos dentro do bucim M20 (todos com r ≤ 5,8 mm < 6,5 mm):
  // U1/V1/W1/PE ocupam os 4 quadrantes; W2/U2/V2 (estrela-triângulo) ocupam canais próprios sem colidir!
  const slotMap: Record<string, { idx: number; dx: number; dy: number }> = {
    PE: { idx: 0, dx: -2.6, dy: 2.6 },
    U1: { idx: 1, dx: -2.6, dy: -2.6 },
    V1: { idx: 2, dx: 2.6, dy: 2.6 },
    W1: { idx: 3, dx: 2.6, dy: -2.6 },
    W2: { idx: 4, dx: -5.8, dy: 0 },
    U2: { idx: 5, dx: 0, dy: 5.8 },
    V2: { idx: 6, dx: 0, dy: -5.8 },
    Z1: { idx: 3, dx: 2.6, dy: -2.6 },
    Z2: { idx: 4, dx: -5.8, dy: 0 },
  }
  const probeSlotMap: Record<string, { idx: number; dx: number; dy: number }> = {
    U1: { idx: 7, dx: 0, dy: -5.8 },
    V1: { idx: 8, dx: 5.8, dy: 0 },
  }
  const slot = ctx.endType === 'probe' ? probeSlotMap[label] ?? slotMap[label] : slotMap[label]
  const { idx: rawIdx, dx, dy } = slot ?? { idx: 1, dx: 0, dy: 0 }
  const harnessIdx = ctx.endType === 'probe' ? rawIdx : (slotOverride?.motorSlot ?? rawIdx)
  const cad = (cx: number, cy: number, cz: number): V3 => arr(motorCadToWorld(ctx.component, mPivot, cx, cy, cz))

  const frontZ = wireFrontLimit(outerMm)
  const enclosures = enclosureVolumesOf(obstacles)
  const panelEnc = ctx.endType === 'probe' ? undefined : enclosureContainingPoint(panelHead, enclosures, panelEnd.enclosureId)

  // Coordenadas do bucim M20 e da aproximação frontal alinhada.
  const gx = MOTOR_GLAND.x + dx
  const gy = MOTOR_GLAND.y + dy
  const boxZ1 = MOTOR_BOX.z1
  const wall = MOTOR_BOX.wall
  const frontStep = ctx.endType === 'probe' ? (rawIdx - 3) * 6 : (harnessIdx % 4) * 3.4 + Math.floor(harnessIdx / 4) * 4.5
  const frontClear = MOTOR_CAD.maxZ + (ctx.endType === 'probe' ? 22 : 29) + frontStep
  const entryLeft = cad(-38, gy, frontClear)
  const frontSweep = cad(gx, gy, frontClear)
  const glandOutside = cad(gx, gy, boxZ1 + 14)
  const glandMouth = cad(gx, gy, boxZ1 + 6)
  const glandThru = cad(gx, gy, boxZ1 - wall * 0.5)
  const glandInside = cad(gx, gy, boxZ1 - wall - 8)

  const ownBox = obstacles.find((b) => b.componentId === panelEnd.componentId && !b.enclosureWall && !b.duct)
  const clearance = (outerMm / 2) * U + 0.042
  let leadStep = Math.max(outerMm * 2.8 * U, 0.05)
  if (ownBox) {
    if (panelAxis[2] > 0.5) leadStep = Math.max(leadStep, ownBox.max.z + clearance - panelHead[2])
    else if (panelAxis[1] > 0.5) leadStep = Math.max(leadStep, ownBox.max.y + clearance - panelHead[1])
    else if (panelAxis[1] < -0.5) leadStep = Math.max(leadStep, panelHead[1] - (ownBox.min.y - clearance))
    else if (panelAxis[0] > 0.5) leadStep = Math.max(leadStep, ownBox.max.x + clearance - panelHead[0])
    else if (panelAxis[0] < -0.5) leadStep = Math.max(leadStep, panelHead[0] - (ownBox.min.x - clearance))
  }
  let panelExitZ = Math.max(frontZ, panelHead[2] + panelAxis[2] * leadStep)
  if (panelAxis[2] > 0.7) {
    const clearZ = outerMm * U * 2.6 + 0.048
    for (const ob of obstacles) {
      if (ob.rail || ob.duct || ob.enclosureWall) continue
      if (panelHead[0] < ob.min.x - 0.02 || panelHead[0] > ob.max.x + 0.02 || panelHead[1] < ob.min.y - 0.02 || panelHead[1] > ob.max.y + 0.02) continue
      panelExitZ = Math.max(panelExitZ, ob.max.z + clearZ)
    }
  }
  const exitPanel: V3 = [
    panelHead[0] + panelAxis[0] * leadStep,
    panelHead[1] + panelAxis[1] * leadStep,
    panelExitZ,
  ]

  let feederOuter: V3[] = []
  if (!manual.length && ctx.endType !== 'probe') {
    if (panelEnc) {
      // ── Quadro fechado com calhas técnicas (ex.: Estrela-Triângulo QE1 → M1) ──
      // Os cabos de força e PE juntam-se na calha inferior CT3, descem em feixe compacto pela chapa
      // inferior de bucins (`enclosure-gland`) no canto direito e seguem filaçados até ao bucim do motor!
      const col = harnessIdx % 4
      const row = Math.floor(harnessIdx / 4)
      const insideEnc = (b: WireObstacle) =>
        b.max.x > panelEnc.minX && b.min.x < panelEnc.maxX && b.max.y > panelEnc.minY && b.min.y < panelEnc.maxY
      const hDucts = obstacles.filter((b) => b.duct && b.ductAxis === 'x' && insideEnc(b))
        .map((b) => (b.min.y + b.max.y) * 0.5).sort((a, b) => a - b)
      const vDucts = obstacles.filter((b) => b.duct && b.ductAxis === 'y' && insideEnc(b))
        .map((b) => (b.min.x + b.max.x) * 0.5).sort((a, b) => a - b)
      const motorRight = mPivot.x >= (panelEnc.minX + panelEnc.maxX) * 0.5
      const collectY = (hDucts[0] ?? (panelEnc.minY + 0.55)) + (col - 1.5) * 0.036
      const glandBaseX = vDucts.length > 0
        ? (motorRight ? vDucts[vDucts.length - 1] : vDucts[0])
        : (motorRight ? panelEnc.maxX - 0.36 : panelEnc.minX + 0.36)
      const glandX = glandBaseX + (col - 1.5) * 0.038
      const ductZ = frontZ + 0.145 + row * 0.040
      const belowEncY = panelEnc.minY - 0.24 - col * 0.038
      const extZ = ductZ + 0.06
      const midRiseX = motorRight
        ? Math.max(glandX + 0.45, Math.min(entryLeft[0] - 0.36, (panelEnc.maxX + entryLeft[0]) * 0.55)) + (col - 1.5) * 0.038
        : Math.min(glandX - 0.45, Math.max(entryLeft[0] + 0.36, (panelEnc.minX + entryLeft[0]) * 0.55)) - (col - 1.5) * 0.038
      const approachY = entryLeft[1] + (row - 0.5) * 0.022
      const approachZ = Math.max(extZ, entryLeft[2] - 0.08 + row * 0.038)

      feederOuter = [
        panelHead,
        ...(v(exitPanel).distanceTo(v(panelHead)) > 1e-4 ? [exitPanel] : []),
        [exitPanel[0], collectY, Math.max(exitPanel[2], ductZ + 0.03)],
        [exitPanel[0], collectY, ductZ],
        [glandX, collectY, ductZ],
        [glandX, belowEncY, ductZ],
        [midRiseX, belowEncY, extZ],
        ...(Math.abs(approachY - belowEncY) > 0.14 ? [[midRiseX, approachY, approachZ] as V3] : []),
        entryLeft,
        frontSweep,
      ]
    } else {
      // ── Painel aberto (ex.: Partida direta → M1) ──
      // Feixe compacto de 4 condutores (PE, U1, V1, W1) lado a lado com passo fino de 3,8 mm,
      // progressão estritamente monótona em X (zero gancho invertido sob o PLC!) e curva larga até ao bucim!
      const panelAllBoxes = obstacles.filter((b) => b.componentId !== ctx.component.id && b.max.x < mPivot.x - 1.0 && !b.hard)
      const softBoxes = panelAllBoxes.filter((b) => !b.rail)
      const railBoxes = panelAllBoxes.filter((b) => b.rail)
      const railFrontZ = railBoxes.length > 0 ? Math.max(...railBoxes.map((b) => b.max.z)) + (outerMm / 2) * U + 0.042 : frontZ + 0.08
      // Secção hexagonal/2×2 compacta (condutores encostados isolamento-a-isolamento → filaças PA66 super apertadas!).
      const touchPitch = Math.max(0.032, outerMm * U + 0.0012)
      const hCol = Math.floor(harnessIdx / 2)
      const hLay = harnessIdx % 2
      const bottomDuctY = (softBoxes.length > 0 ? Math.min(...softBoxes.map((b) => b.min.y)) : Math.min(panelHead[1], 0))
        - 0.14 - hCol * touchPitch - hLay * touchPitch * 0.25
      const ductZ = Math.max(frontZ + 0.028, 0.018) + hLay * (touchPitch * 0.92)
      const panelChain: V3[] = [panelHead]
      if (v(exitPanel).distanceTo(v(panelHead)) > 1e-4) panelChain.push(exitPanel)

      if (panelAxis[2] > 0.5 || panelAxis[1] > 0.35 || (panelEnd.localY !== undefined && panelEnd.localY > 0.6)) {
        const leftEdgeX = (panelAllBoxes.length > 0 ? Math.min(...panelAllBoxes.map((b) => b.min.x)) : panelHead[0]) - 0.14 - harnessIdx * 0.028
        const rightEdgeX = (panelAllBoxes.length > 0 ? Math.max(...panelAllBoxes.map((b) => b.max.x)) : panelHead[0]) + 0.14 + harnessIdx * 0.028
        const safeCrossZ = Math.max(ductZ + 0.045, railFrontZ, exitPanel[2])
        // Procura a primeira passagem vertical livre entre aparelhos da calha DIN na direção do motor
        // (ex.: fenda XG–QG para o PE de XG → M1), evitando laços largos para fora da borda esquerda da chapa!
        const bandBoxes = softBoxes
          .filter((b) => b.max.y > bottomDuctY + 0.04 && b.min.y < exitPanel[1] + 0.16)
          .sort((a, b) => a.min.x - b.min.x)
        const slotCandidates: number[] = [leftEdgeX, rightEdgeX]
        if (bandBoxes.length > 0) {
          let reach = bandBoxes[0].max.x
          for (let i = 1; i < bandBoxes.length; i += 1) {
            const gap = bandBoxes[i].min.x - reach
            if (gap >= 0.12) {
              // Evita atravessar pela frente de outros bornes do próprio aparelho quando sai para +Z.
              const mid = (reach + bandBoxes[i].min.x) * 0.5
              const crossesOwnFront = panelAxis[2] > 0.5 && ownBox
                && ((mid < panelHead[0] && panelHead[0] - ownBox.min.x > 0.12)
                  || (mid > panelHead[0] && ownBox.max.x - panelHead[0] > 0.12))
              if (!crossesOwnFront) slotCandidates.push(mid)
            }
            reach = Math.max(reach, bandBoxes[i].max.x)
          }
        }
        const goalX = entryLeft[0]
        const dropX = slotCandidates.reduce((best, cx) => {
          const isExtC = cx === leftEdgeX || cx === rightEdgeX
          const isExtB = best === leftEdgeX || best === rightEdgeX
          const costC = Math.abs(exitPanel[0] - cx) + Math.abs(goalX - cx) + (isExtC ? 0.45 : 0)
          const costB = Math.abs(exitPanel[0] - best) + Math.abs(goalX - best) + (isExtB ? 0.45 : 0)
          return costC < costB ? cx : best
        }, leftEdgeX)
        if (panelAxis[2] > 0.5) {
          panelChain.push(
            [dropX, exitPanel[1], safeCrossZ],
            [dropX, bottomDuctY, safeCrossZ],
            [dropX, bottomDuctY, ductZ],
          )
        } else {
          const spanLo = Math.min(exitPanel[0], dropX) - 0.04
          const spanHi = Math.max(exitPanel[0], dropX) + 0.04
          const topClearY = (softBoxes.length > 0
            ? Math.max(...softBoxes.filter((b) => b.max.x >= spanLo && b.min.x <= spanHi).map((b) => b.max.y), exitPanel[1])
            : exitPanel[1]) + 0.11
          panelChain.push(
            [exitPanel[0], Math.max(exitPanel[1], topClearY), safeCrossZ],
            [dropX, Math.max(exitPanel[1], topClearY), safeCrossZ],
            [dropX, bottomDuctY, safeCrossZ],
            [dropX, bottomDuctY, ductZ],
          )
        }
      } else {
        const dropZ = Math.max(exitPanel[2], ductZ + 0.032)
        panelChain.push(
          [exitPanel[0], bottomDuctY, dropZ],
          [exitPanel[0], bottomDuctY, ductZ],
        )
      }

      // Avança na horizontal apenas até antes de `entryLeft[0]` — NUNCA ultrapassa para depois voltar atrás!
      const lastPanelX = panelChain[panelChain.length - 1][0]
      const rawRightX = (softBoxes.length > 0 ? Math.max(...softBoxes.map((b) => b.max.x)) : panelHead[0]) + 0.08
      const turnX = entryLeft[0] >= lastPanelX + 0.25
        ? Math.max(lastPanelX + 0.14, Math.min(rawRightX, entryLeft[0] - 0.22)) + harnessIdx * 0.026
        : entryLeft[0]
      const midZ = Math.max(ductZ, ductZ + (entryLeft[2] - ductZ) * 0.55)
      feederOuter = [
        ...panelChain,
        ...(turnX > lastPanelX + 0.08 ? [[turnX, bottomDuctY, ductZ] as V3] : []),
        ...(Math.hypot(entryLeft[0] - turnX, entryLeft[2] - ductZ) > 0.16
          ? [[entryLeft[0], bottomDuctY, midZ] as V3]
          : []),
        entryLeft,
        frontSweep,
      ]
    }
  }

  // Chegada alinhada com a terminação dentro da caixa de bornes: Bézier cúbica suave sem «S».
  const approach: V3 = arr(v(motorHead).addScaledVector(v(motorAxis), 7 * U))
  const innerStart = label === 'U1' || label === 'W2' ? cad(gx, gy, boxZ1 - wall - 3) : glandInside
  const LIFT_MM: Record<string, number> = { U1: 4, W2: 7, V1: 9, U2: 12, W1: 1, V2: -2, Z1: 1, Z2: 6, PE: 0 }
  const lift = (ctx.endType === 'probe' ? 0 : LIFT_MM[label] ?? 3) * U
  const motorUp = v(cad(gx, gy + 1, 0)).sub(v(cad(gx, gy, 0))).normalize()
  const motorRight = v(cad(gx + 1, gy, 0)).sub(v(cad(gx, gy, 0))).normalize()
  const inward = v(glandInside).sub(v(glandThru)).normalize()
  const probeRouteOffset = ctx.endType === 'probe' ? (label === 'U1' ? -10 : label === 'V1' ? 12 : 0) * U : 0
  const p0 = v(innerStart)
  const p3 = v(approach)
  const reach = p0.distanceTo(p3) * 0.42
  const innerBoxPoints: V3[] = new THREE.CubicBezierCurve3(
    p0,
    p0.clone().addScaledVector(inward, reach).addScaledVector(motorUp, lift).addScaledVector(motorRight, probeRouteOffset),
    p3.clone().addScaledVector(v(motorAxis), reach).addScaledVector(motorUp, lift),
    p3,
  ).getPoints(28).slice(1, -1).map(arr)

  const probeExterior = ctx.endType === 'probe' && !manual.length
    ? (() => {
      const pReach = Math.max(0.35, v(panelHead).distanceTo(v(frontSweep)) * 0.42)
      const entryAxis = v(glandOutside).sub(v(frontSweep)).normalize()
      return new THREE.CubicBezierCurve3(
        v(panelHead), v(panelHead).addScaledVector(v(panelAxis), pReach),
        v(frontSweep).addScaledVector(entryAxis, -pReach), v(frontSweep),
      ).getPoints(96).map(arr)
    })() : undefined
  const outerControls: V3[] = manual.length
    ? [panelHead, ...manual, frontSweep]
    : probeExterior ?? feederOuter
  const probeTransition: V3[] = []
  if (ctx.endType === 'probe') {
    const previous = [...outerControls].reverse().find((point) => v(point).distanceTo(v(frontSweep)) > 1e-4)
    const startDirection = previous
      ? v(frontSweep).sub(v(previous)).normalize()
      : v(glandOutside).sub(v(frontSweep)).normalize()
    const endDirection = v(glandMouth).sub(v(glandOutside)).normalize()
    const tReach = Math.min(12 * U, v(frontSweep).distanceTo(v(glandOutside)) * 0.3)
    probeTransition.push(...new THREE.CubicBezierCurve3(
      v(frontSweep),
      v(frontSweep).addScaledVector(startDirection, tReach),
      v(glandOutside).addScaledVector(endDirection, -tReach),
      v(glandOutside),
    ).getPoints(18).slice(1).map(arr))
  }
  // Arredonda o troço exterior até à entrada interior da caixa; dentro da caixa a Bézier cúbica de 28 pontos já é C² contínua!
  const outerWithGland: V3[] = [
    ...outerControls,
    ...(ctx.endType === 'probe' ? probeTransition : [glandOutside]),
    glandMouth,
    glandThru,
    innerStart,
  ]
  const dedupedOuter = outerWithGland.filter((pt, i) => i === 0 || v(pt).distanceTo(v(outerWithGland[i - 1])) > 1e-4)
  const smoothOuter = roundCorners(dedupedOuter, outerMm, !manual.length && ctx.endType !== 'probe' ? 4.8 : 3.6)
  const combined: V3[] = [...smoothOuter, ...innerBoxPoints, approach, motorHead]
  return {
    points: keepInFrontOfPlate(smoothSharpCorners(dropMicroSegments(combined), outerMm, 0.25), outerMm),
    entry: ctx.endType === 'probe' || manual.length ? frontSweep : entryLeft,
    enclosureGlandId: panelEnc?.id,
  }
}

/** Transforma coordenadas locais (mm, centro do armário = 0) da Caixa de Água para coordenadas mundiais 3D. */
function waterBoxLocalMmToWorld(component: ElectricalComponent, pivot: THREE.Vector3, mmX: number, mmY: number, mmZ: number): V3 {
  const scale = component3DScaleOf(component)
  const local = new THREE.Vector3(mmX * U * scale.x, mmY * U * scale.y, mmZ * U * scale.z)
  const [rx, ry, rz] = orientationRadians(componentOrientationOf(component))
  local.applyEuler(new THREE.Euler(rx, ry, rz, 'XYZ'))
  if (component.mirrored) local.x *= -1
  local.applyEuler(new THREE.Euler(0, 0, schematicRotationRadians(component), 'XYZ')).add(pivot)
  return arr(local)
}

/** Encaminhamento automático de fios elétricos (+24V / PULSE / GND) que entram na Caixa / Fonte de Água:
 *  entram verticalmente pelo bucim PG16 do teto do armário, atravessam o bucim PG13.5 superior direito
 *  da caixa de derivação OBO interior e curvam limpos para a boca direita livre de cada WAGO 221-2411. */
function buildWaterBoxGlandBody3D(
  otherEnd: WireEndpoint3D,
  otherHead: V3,
  otherAxis: V3,
  boxEnd: WireEndpoint3D,
  boxHead: V3,
  outerMm: number,
  obstacles: WireObstacle[],
  manual: V3[] = [],
): { points: V3[]; entry: V3 } {
  const ctx = boxEnd.waterBoxGlandContext
  if (!ctx) throw new Error('Water supply box gland routing requires waterBoxGlandContext')
  const port = waterSupplyBoxWagoPortMm(ctx.terminalLabel)!
  const s = WATER_SUPPLY_BOX_SIZE_MM
  const j = WATER_SUPPLY_BOX_JUNCTION_MM
  const bPivot = v(ctx.pivot)
  const local = (mx: number, my: number, mz: number) => waterBoxLocalMmToWorld(ctx.component, bPivot, mx, my, mz)

  const gx = j.center.x + j.glandOffsetX + port.glandDx
  const gz = j.center.z + port.glandDz
  const roofY = s.h / 2
  const oboTopY = j.center.y + j.h / 2

  // Troço físico fixo: entrada reta vertical no bucim do teto -> bucim PG13.5 da caixa OBO -> curva limpa -> boca direita do WAGO 221-2411.
  const glandAbove = local(gx, roofY + 50, gz)
  const roofMouth = local(gx, roofY + 18, gz)
  const roofThru = local(gx, roofY - 4, gz)
  const oboMouth = local(gx, oboTopY + 11, gz)
  const oboInside = local(gx, oboTopY - 10, gz)
  const cornerInObo = local(gx, port.y, port.z)
  const wagoApproach = local(port.x + 7.5, port.y, port.z)

  // Curva interior C¹ limpa dentro da caixa OBO (do bucim superior até à boca horizontal do WAGO).
  const oboCurvePts = roundCorners(
    [oboMouth, oboInside, cornerInObo, wagoApproach, boxHead],
    outerMm,
    2.4,
  )
  const protectedTail: V3[] = [glandAbove, roofMouth, roofThru, ...oboCurvePts]

  // Troço exterior do quadro/outro componente até acima do bucim PG16 do teto da Caixa de Água.
  const lead = Math.max(outerMm * 2.8 * U, 0.08)
  const exitOther: V3 = [
    otherHead[0] + otherAxis[0] * lead,
    otherHead[1] + otherAxis[1] * lead,
    otherHead[2] + otherAxis[2] * lead,
  ]
  const highY = Math.max(exitOther[1] + 0.14, glandAbove[1] + 0.12)
  const transitZ = Math.max(wireFrontLimit(outerMm), glandAbove[2])
  const outerControls: V3[] = manual.length
    ? [otherHead, exitOther, ...manual, glandAbove]
    : [
      otherHead,
      exitOther,
      [exitOther[0], highY, Math.max(exitOther[2], transitZ)],
      [glandAbove[0], highY, transitZ],
      [glandAbove[0], glandAbove[1] + 0.06, glandAbove[2]],
      glandAbove,
    ]
  const dedupedOuter = outerControls.filter((pt, i) => i === 0 || v(pt).distanceTo(v(outerControls[i - 1])) > 1e-4)
  const smoothOuter = roundCorners(dedupedOuter, outerMm, manual.length ? 3.2 : 4.2)
  const combined: V3[] = [...smoothOuter.slice(0, -1), ...protectedTail]
  const cleaned = combined.filter((pt, i) => i === 0 || v(pt).distanceTo(v(combined[i - 1])) > 1e-4)
  return { points: cleaned, entry: glandAbove }
}

/** Corrige os sólidos só no troço exterior; a passagem física no motor é fixa. */
function clearPathSolids(
  points: V3[],
  outerMm: number,
  obstacles: WireObstacle[],
  exits: Parameters<typeof keepWireOutsideSolids>[3],
  minZ: number,
  track: number,
  motorRoute?: WirePath3D['motorRoute'],
): V3[] {
  if (!motorRoute) return keepWireOutsideSolids(points, outerMm, obstacles, exits, minZ, track)
  const fixed = motorRoute.points
  const tail = motorRoute.side === 'to'
  const outer = tail ? points.slice(0, points.length - fixed.length + 1) : points.slice(fixed.length - 1)
  // O troço exterior contorna também o motor. Só a cauda física já validada
  // pode passar pelo seu bucim, incluindo quando se roda ou espelha o motor.
  const outerExits = exits.map(exit => ({ ...exit, glandBypass: false })) as typeof exits
  const safe = keepWireOutsideSolids(outer, outerMm, obstacles, outerExits, minZ, track)
  if (safe === outer) return points
  return !safe.length ? [] : tail ? [...safe.slice(0, -1), ...fixed] : [...fixed, ...safe.slice(1)]
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
  // Cabos de potência/comando ligados ao motor passam pelo bucim M20.
  // Pontas de prova do multímetro (probe/banana) ligam diretamente aos bornes sem passar pelo bucim.
  const manualPoints: V3[] = wire.waypoints3D?.map((p) => [p.x, p.y, p.z] as V3) ?? []
  const isMultimeterLead = fromType === 'probe' || toType === 'probe' || fromType === 'banana' || toType === 'banana'
  const fromMotorGland = !isMultimeterLead && isMotorGlandEligible(from, fromType) && !to.motorContext
  const toMotorGland = !isMultimeterLead && isMotorGlandEligible(to, toType) && !from.motorContext

  if (toMotorGland || fromMotorGland) {
    const { trunkHint, plan } = computeBasePlan(wire, from, to, outerMm, obstacles)
    const effectivePlan = plan ? (slotOverride ? { ...plan, slot: slotOverride } : plan) : undefined
    const preliminary = wireBodyPoints3D(wire, from.position, to.position, outerMm, {}, obstacles, trunkHint, effectivePlan)
    // A terminação no motor aponta para o interior do bucim (olhal deitado
    // sob a porca); a do quadro segue o traçado preliminar.
    const motorSide = toMotorGland ? to : from
    const glandTarget = arr(motorCadToWorld(motorSide.motorContext!.component, v(motorSide.motorContext!.pivot), MOTOR_GLAND.x, MOTOR_GLAND.y, MOTOR_BOX.z1 - MOTOR_BOX.wall - 8))
    const a = endHead(from, fromType, fromMotorGland ? glandTarget : preliminary[Math.min(1, preliminary.length - 1)], outerMm)
    const b = endHead(to, toType, toMotorGland ? glandTarget : preliminary[Math.max(0, preliminary.length - 2)], outerMm)
    const gland = toMotorGland
      ? buildMotorGlandBody3D(from, a.head, a.geometry.axis, to, b.head, b.geometry.axis, outerMm, obstacles, manualPoints, slotOverride)
      : buildMotorGlandBody3D(to, b.head, b.geometry.axis, from, a.head, a.geometry.axis, outerMm, obstacles, manualPoints.slice().reverse(), slotOverride)
    let entryIndex = 0
    for (let i = 1; i < gland.points.length; i++) if (v(gland.points[i]).distanceToSquared(v(gland.entry)) < v(gland.points[entryIndex]).distanceToSquared(v(gland.entry))) entryIndex = i
    const motorRoute: NonNullable<WirePath3D['motorRoute']> = { side: toMotorGland ? 'to' : 'from', points: toMotorGland ? gland.points.slice(entryIndex) : gland.points.slice(entryIndex).reverse() }
    const glandBody = toMotorGland ? gland.points : gland.points.slice().reverse()
    const safe = clearPathSolids(glandBody, outerMm, obstacles, [
        { componentId: from.componentId, axis: a.geometry.axis, glandBypass: fromMotorGland, enclosureGlandId: gland.enclosureGlandId },
        { componentId: to.componentId, axis: b.geometry.axis, glandBypass: toMotorGland, enclosureGlandId: gland.enclosureGlandId },
      ], wireFrontLimit(outerMm), wireHash(wire), motorRoute)
    return { points: safe, starts: [a.geometry, b.geometry], motorRoute }
  }

  // Fios elétricos (+24V / PULSE / GND) ligados à Caixa / Fonte de Água entram automaticamente pelo bucim PG16 do topo e pelo bucim PG13.5 da caixa OBO até aos WAGO 221-2411!
  const isFluidWire = wire.kind === 'hydraulic' || wire.kind === 'pneumatic'
  const fromWaterBoxGland = !isMultimeterLead && !isFluidWire && Boolean(from.waterBoxGlandContext) && !to.waterBoxGlandContext
  const toWaterBoxGland = !isMultimeterLead && !isFluidWire && Boolean(to.waterBoxGlandContext) && !from.waterBoxGlandContext

  if (toWaterBoxGland || fromWaterBoxGland) {
    const boxSide = toWaterBoxGland ? to : from
    const ctx = boxSide.waterBoxGlandContext!
    const port = waterSupplyBoxWagoPortMm(ctx.terminalLabel)!
    const j = WATER_SUPPLY_BOX_JUNCTION_MM
    const s = WATER_SUPPLY_BOX_SIZE_MM
    const bPivot = v(ctx.pivot)
    const wagoApproachTarget = waterBoxLocalMmToWorld(ctx.component, bPivot, port.x + 10, port.y, port.z)
    const glandAboveTarget = waterBoxLocalMmToWorld(ctx.component, bPivot, j.center.x + j.glandOffsetX + port.glandDx, s.h / 2 + 50, j.center.z + port.glandDz)
    const a = endHead(from, fromType, fromWaterBoxGland ? wagoApproachTarget : glandAboveTarget, outerMm)
    const b = endHead(to, toType, toWaterBoxGland ? wagoApproachTarget : glandAboveTarget, outerMm)
    const gland = toWaterBoxGland
      ? buildWaterBoxGlandBody3D(from, a.head, a.geometry.axis, to, b.head, outerMm, obstacles, manualPoints)
      : buildWaterBoxGlandBody3D(to, b.head, b.geometry.axis, from, a.head, outerMm, obstacles, manualPoints.slice().reverse())
    let entryIndex = 0
    for (let i = 1; i < gland.points.length; i++) {
      if (v(gland.points[i]).distanceToSquared(v(gland.entry)) < v(gland.points[entryIndex]).distanceToSquared(v(gland.entry))) entryIndex = i
    }
    const protectedRoute: NonNullable<WirePath3D['motorRoute']> = {
      side: toWaterBoxGland ? 'to' : 'from',
      points: toWaterBoxGland ? gland.points.slice(entryIndex) : gland.points.slice(entryIndex).reverse(),
    }
    const glandBody = toWaterBoxGland ? gland.points : gland.points.slice().reverse()
    const safe = clearPathSolids(
      glandBody,
      outerMm,
      obstacles,
      [
        { componentId: from.componentId, axis: a.geometry.axis, glandBypass: fromWaterBoxGland },
        { componentId: to.componentId, axis: b.geometry.axis, glandBypass: toWaterBoxGland },
      ],
      wireFrontLimit(outerMm),
      wireHash(wire),
      protectedRoute,
    )
    return { points: safe.length > 1 ? safe : glandBody, starts: [a.geometry, b.geometry], motorRoute: protectedRoute }
  }

  // Chicote industrial de aparelhos montados na porta (`door`/`doorOuter`) — sem pontos manuais 3D.
  if (!manualPoints.length && (from.doorContext || to.doorContext) && wire.route !== 'direct') {
    const fromIsDoor = Boolean(from.doorContext)
    const a = endHead(from, fromType, [from.position[0], from.position[1] - 0.3, from.position[2]], outerMm)
    const b = endHead(to, toType, [to.position[0], to.position[1] - 0.3, to.position[2]], outerMm)
    const doorEncId = (from.doorContext ?? to.doorContext)!.enclosureId
    const rawDoor = fromIsDoor
      ? buildDoorHarnessBody3D(from, a.head, to, b.head, b.geometry.axis, outerMm, obstacles, slotOverride?.doorSlot ?? 0, slotOverride?.doorTotal ?? 1)
      : buildDoorHarnessBody3D(to, b.head, from, a.head, a.geometry.axis, outerMm, obstacles, slotOverride?.doorSlot ?? 0, slotOverride?.doorTotal ?? 1).reverse()
    const doorExits: Parameters<typeof keepWireOutsideSolids>[3] = [
      { componentId: from.componentId, axis: a.geometry.axis, enclosureDoorId: from.doorContext?.enclosureId },
      { componentId: to.componentId, axis: b.geometry.axis, enclosureDoorId: to.doorContext?.enclosureId },
    ]
    // Mantém o chicote da porta livre de aparelhos interiores e paredes laterais, autorizando o furo Ø22 da porta.
    const safeDoor = keepWireOutsideSolids(rawDoor, outerMm, obstacles.filter((o) => !(o.componentId === doorEncId && o.enclosureWall === 'door')), doorExits, wireFrontLimit(outerMm), wireHash(wire))
    return { points: safeDoor.length > 1 ? safeDoor : rawDoor, starts: [a.geometry, b.geometry] }
  }

  const { trunkHint, plan } = computeBasePlan(wire, from, to, outerMm, obstacles)
  const effectivePlan = plan ? (slotOverride ? { ...plan, slot: slotOverride } : plan) : undefined
  const preliminary = wireBodyPoints3D(wire, from.position, to.position, outerMm, {}, obstacles, trunkHint, effectivePlan)
  const a = endHead(from, fromType, preliminary[Math.min(1, preliminary.length - 1)], outerMm)
  const b = endHead(to, toType, preliminary[Math.max(0, preliminary.length - 2)], outerMm)
  const body = wireBodyPoints3D(wire, a.head, b.head, outerMm, { a: a.geometry.axis, b: b.geometry.axis }, obstacles, trunkHint, effectivePlan)
  const fronted = keepInFrontOfPlate(body, outerMm)
  const finished = finishWireBody(fronted, wire, outerMm, obstacles,
    [{ componentId: from.componentId, axis: a.geometry.axis }, { componentId: to.componentId, axis: b.geometry.axis }])
  // Sem desvio livre de sólidos (lista vazia): fica o traçado base, para o cabo nunca desaparecer.
  const safe = finished.length > 1 ? finished : fronted
  // Ponta livre: forçar um troço reto curto no eixo da ponteira para o isolamento
  // encaixar no colar sem «flutuar» nem sair torto após o arredondamento.
  const aligned = alignFreeEndApproach(safe, from, a, to, b, outerMm)
  return { points: aligned, starts: [a.geometry, b.geometry] }
}

/** Garante ~8–12 mm de cabo alinhado com o eixo da ponteira em pontas livres.
 *  A primeira/última amostra do tubo fica exactamente em `head` (início do isolamento),
 *  e o troço seguinte segue o eixo da ponteira — elimina vãos e ponteiras tortas. */
function alignFreeEndApproach(
  points: V3[],
  from: WireEndpoint3D,
  a: { head: V3; geometry: WireEndGeometry },
  to: WireEndpoint3D,
  b: { head: V3; geometry: WireEndGeometry },
  outerMm: number,
): V3[] {
  if (points.length < 2) return points
  const lead = Math.max(9, outerMm * 3.5) * U
  let out = points.slice()
  const needsLead = (type: WireEndType) => type !== 'none' && type !== 'tinned'

  if (from.free && needsLead(a.geometry.type)) {
    const axis = v(a.geometry.axis)
    const head = v(a.head)
    const target = head.clone().addScaledVector(axis, lead)
    // Fixar origem no head e inserir ponto de abordagem axial.
    const rest = out.slice(1).filter((pt) => v(pt).distanceTo(head) > lead * 0.55)
    out = [arr(head), arr(target), ...rest]
    out = out.filter((pt, i) => i === 0 || v(pt).distanceTo(v(out[i - 1])) > 1e-4)
  }
  if (to.free && needsLead(b.geometry.type)) {
    const axis = v(b.geometry.axis)
    const head = v(b.head)
    const target = head.clone().addScaledVector(axis, lead)
    const rest = out.slice(0, -1).filter((pt) => v(pt).distanceTo(head) > lead * 0.55)
    out = [...rest, arr(target), arr(head)]
    out = out.filter((pt, i) => i === 0 || v(pt).distanceTo(v(out[i - 1])) > 1e-4)
  }
  return out
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

  // 1) Colorir por intervalos cada calha horizontal: cabos do MESMO `bundleId` recebem canais contíguos e justos
  //    (passo ~3,6 mm num único plano Z sempre que possível → feixe penteado com abraçadeiras PA66 realistas!).
  const slots = new Map<string, WireSlotOverride>()
  for (const e of entries) slots.set(e.wire.id, {})
  const enclosures = enclosureVolumesOf(obstacles)

  // 1a) Ordenar slots dos chicotes de porta (`doorContext`) por armário e altura do operador.
  const doorGroups = new Map<string, Entry[]>()
  for (const e of entries) {
    const dc = e.from.doorContext ?? e.to.doorContext
    if (!dc || (e.from.doorContext && e.to.doorContext)) continue
    const list = doorGroups.get(dc.enclosureId) ?? []
    list.push(e)
    doorGroups.set(dc.enclosureId, list)
  }
  for (const [, list] of doorGroups) {
    list.sort((a, b) => {
      const da = a.from.doorContext ? a.from.position : a.to.position
      const db = b.from.doorContext ? b.from.position : b.to.position
      return (db[1] - da[1]) || (da[2] - db[2]) || a.wire.id.localeCompare(b.wire.id)
    })
    list.forEach((e, idx) => {
      const s = slots.get(e.wire.id)!
      s.doorSlot = idx
      s.doorTotal = list.length
    })
  }

  // 1b) Ordenar slots dos chicotes de motor (fases + estrela-triângulo + PE; exclui pontas de prova).
  const motorGroups = new Map<string, Entry[]>()
  const motorLabelOrder: Record<string, number> = { PE: 0, U1: 1, V1: 2, W1: 3, W2: 4, U2: 5, V2: 6, Z1: 7, Z2: 8 }
  for (const e of entries) {
    const fType = endTypeOf(e.wire, 'from'), tType = endTypeOf(e.wire, 'to')
    if (fType === 'probe' || tType === 'probe') continue
    const fromM = isMotorGlandEligible(e.from, fType) && !e.to.motorContext
    const toM = isMotorGlandEligible(e.to, tType) && !e.from.motorContext
    if (!fromM && !toM) continue
    const mId = (toM ? e.to : e.from).componentId ?? 'motor'
    const list = motorGroups.get(mId) ?? []
    list.push(e)
    motorGroups.set(mId, list)
  }
  for (const [, list] of motorGroups) {
    list.sort((a, b) => {
      const la = (a.to.motorContext ?? a.from.motorContext)!.terminalLabel.toUpperCase()
      const lb = (b.to.motorContext ?? b.from.motorContext)!.terminalLabel.toUpperCase()
      const oa = motorLabelOrder[la] ?? 9, ob = motorLabelOrder[lb] ?? 9
      if (oa !== ob) return oa - ob
      const pa = a.to.motorContext ? a.from.position[0] : a.to.position[0]
      const pb = b.to.motorContext ? b.from.position[0] : b.to.position[0]
      return pa - pb || a.wire.id.localeCompare(b.wire.id)
    })
    list.forEach((e, idx) => {
      const s = slots.get(e.wire.id)!
      s.motorSlot = idx
      s.motorTotal = list.length
    })
  }

  type SpanReq = { wireId: string; bundleKey: string; side: 'A' | 'B'; minX: number; maxX: number; outerMm: number; inDuct: boolean }
  const byLane = new Map<string, { laneVal: number; inDuct: boolean; spans: SpanReq[] }>()
  const addLaneSpan = (lane: number, inDuct: boolean, wire: Wire, side: 'A' | 'B', x0: number, x1: number, outerMm: number) => {
    const laneVal = Math.round(lane * 1000) / 1000
    const key = `${inDuct ? 'D' : 'O'}:${laneVal}`
    const group = byLane.get(key) ?? { laneVal, inDuct, spans: [] }
    group.spans.push({
      wireId: wire.id,
      bundleKey: wire.bundleId ?? `~solo~${wire.kind}`,
      side,
      minX: Math.min(x0, x1),
      maxX: Math.max(x0, x1),
      outerMm,
      inDuct,
    })
    byLane.set(key, group)
  }

  for (const e of entries) {
    const p = e.basePlan
    if (!p) continue
    const inDuct = Boolean(p.inDuct)
    if (p.riserX === undefined || Math.abs(p.laneA - p.laneB) < 1e-6) {
      addLaneSpan(p.laneA, inDuct, e.wire, 'A', e.from.position[0], e.to.position[0], e.outerMm)
    } else {
      addLaneSpan(p.laneA, inDuct, e.wire, 'A', e.from.position[0], p.riserX, e.outerMm)
      addLaneSpan(p.laneB, inDuct, e.wire, 'B', p.riserX, e.to.position[0], e.outerMm)
    }
  }

  const softBoxes = obstacles.filter((box) => !box.rail && !box.hard)
  const hDuctBoxes = obstacles.filter((box) => box.duct && box.ductAxis === 'x')
  let globalMaxOpenDuctZ = PLATE_Z + PLATE_THICKNESS / 2 + 0.10

  for (const { laneVal, inDuct, spans } of byLane.values()) {
    // Agrupa primeiro por `bundleKey` para que todos os cabos do mesmo chicote ocupem pistas vizinhas encostadas!
    spans.sort((a, b) =>
      a.bundleKey.localeCompare(b.bundleKey)
      || (a.minX - b.minX)
      || ((b.maxX - b.minX) - (a.maxX - a.minX))
      || a.wireId.localeCompare(b.wireId))

    const trackEnds: Array<{ endX: number; bundleKey: string }> = []
    const assignedTrack = new Map<SpanReq, number>()
    for (const sp of spans) {
      // Só partilha a mesma pista com outro cabo do MESMO chicote (sem sobreposição em X).
      let t = trackEnds.findIndex((tr) => tr.bundleKey === sp.bundleKey && tr.endX < sp.minX - 0.065)
      if (t < 0) {
        t = trackEnds.length
        trackEnds.push({ endX: sp.maxX, bundleKey: sp.bundleKey })
      } else {
        trackEnds[t].endX = sp.maxX
      }
      assignedTrack.set(sp, t)
    }

    if (inDuct) {
      // Dentro de calha técnica ranhurada real (ex.: CT1, CT4, CT3 — largura 40 mm, altura 40 mm),
      // ou no corredor inferior compacto sob a régua de bornes (quando `matchDuct === undefined`).
      const matchDuct = hDuctBoxes.find((d) => laneVal >= d.min.y - 0.05 && laneVal <= d.max.y + 0.05)
      const innerHalfY = matchDuct ? Math.max(0.06, (matchDuct.max.y - matchDuct.min.y) * 0.5 - 0.065) : 0.032
      const centerY = matchDuct ? (matchDuct.min.y + matchDuct.max.y) * 0.5 : laneVal
      const pitchY = matchDuct ? 0.036 : 0.022
      const maxRows = Math.max(2, Math.floor((innerHalfY * 2) / pitchY) + 1)
      const rowsUsed = Math.min(trackEnds.length, maxRows)
      // Se for corredor inferior (sem calha PVC), passa à frente de qualquer bloco mais alto (ex.: QG1) sem nunca furar o fundo!
      const crossMinX = Math.min(...spans.map((s) => s.minX))
      const crossMaxX = Math.max(...spans.map((s) => s.maxX))
      const blockingSoft = !matchDuct
        ? softBoxes.filter((b) => b.max.x >= crossMinX && b.min.x <= crossMaxX && b.min.y <= laneVal + 0.07 && b.max.y >= laneVal - 0.07)
        : []
      const clearZBase = blockingSoft.length > 0 ? Math.max(...blockingSoft.map((b) => b.max.z)) + 0.055 : 0
      for (const sp of spans) {
        const t = assignedTrack.get(sp) ?? 0
        const row = t % maxRows
        const layer = Math.floor(t / maxRows)
        const frontZ = wireFrontLimit(sp.outerMm)
        const targetY = centerY + (row - (rowsUsed - 1) * 0.5) * pitchY
        const yOffset = targetY - laneVal
        const ductZ = Math.max(frontZ + 0.125, clearZBase) + (layer % 5) * 0.038
        const s = slots.get(sp.wireId)!
        if (sp.side === 'A') {
          s.yOffsetA = yOffset; s.ductZA = ductZ
          if (s.yOffsetB === undefined) { s.yOffsetB = yOffset; s.ductZB = ductZ }
        } else {
          s.yOffsetB = yOffset; s.ductZB = ductZ
        }
      }
      continue
    }

    // Painel aberto: cada chicote (`bundleId`) é apertado numa roseta hexagonal compacta
    // (condutores encostados isolamento-a-isolamento a ~3,05 mm; separação limpa de 7,8 mm entre chicotes distintos).
    const spanMinX = Math.min(...spans.map((s) => s.minX)) - 0.12
    const spanMaxX = Math.max(...spans.map((s) => s.maxX)) + 0.12
    const localSoft = softBoxes.filter((b) => b.max.x >= spanMinX && b.min.x <= spanMaxX)
    const belowBoxes = localSoft.filter((b) => b.max.y < laneVal + 0.02)
    const aboveBoxes = localSoft.filter((b) => b.min.y > laneVal - 0.02)
    const yFloor = belowBoxes.length > 0 ? Math.max(...belowBoxes.map((b) => b.max.y)) + 0.088 : laneVal - 0.25
    const yCeil = aboveBoxes.length > 0 ? Math.min(...aboveBoxes.map((b) => b.min.y)) - 0.088 : laneVal + 0.25
    const safeCenter = yCeil > yFloor ? (yFloor + yCeil) * 0.5 : laneVal
    const availSpan = Math.max(0.06, yCeil - yFloor)

    // Diâmetro médio por pista para empacotamento sem folga de ar dentro de cada chicote.
    const trackOuterMm = new Array<number>(trackEnds.length).fill(2.9)
    for (const sp of spans) {
      const ti = assignedTrack.get(sp)
      if (ti !== undefined) trackOuterMm[ti] = Math.max(trackOuterMm[ti], sp.outerMm)
    }

    type TrackCluster = { bundleKey: string; indices: number[]; pitch: number; localY: number[]; localZ: number[]; widthY: number }
    const clusters: TrackCluster[] = []
    for (let i = 0; i < trackEnds.length; i++) {
      const bk = trackEnds[i].bundleKey
      const prev = clusters[clusters.length - 1]
      if (prev && !bk.startsWith('~solo~') && prev.bundleKey === bk) {
        prev.indices.push(i)
      } else {
        clusters.push({ bundleKey: bk, indices: [i], pitch: 0.031, localY: [], localZ: [], widthY: 0 })
      }
    }
    for (const cl of clusters) {
      const k = cl.indices.length
      const maxOuter = Math.max(...cl.indices.map((idx) => trackOuterMm[idx]))
      const p = Math.max(0.0295, maxOuter * U + 0.0012)
      cl.pitch = p
      if (k === 1) {
        cl.localY = [0]
        cl.localZ = [0]
        cl.widthY = p
      } else if (k === 2) {
        cl.localY = [-0.5 * p, 0.5 * p]
        cl.localZ = [0, 0]
        cl.widthY = 2 * p
      } else {
        // Favo hexagonal de 2 camadas: base encostada + topo encaixado nos vales a 0,866·p!
        const bot = Math.ceil(k / 2)
        const top = k - bot
        for (let b = 0; b < bot; b++) {
          cl.localY.push((b - (bot - 1) * 0.5) * p)
          cl.localZ.push(0)
        }
        for (let t = 0; t < top; t++) {
          const sameParity = top === bot
          const shift = sameParity ? 0.25 * p : 0
          cl.localY.push((t - (top - 1) * 0.5) * p + shift)
          cl.localZ.push(p * (sameParity ? 0.96 : 0.875))
        }
        cl.widthY = Math.max(bot, top + (top === bot ? 0.25 : 0)) * p
      }
    }

    const interBundleGap = 0.056
    const clusterCenters: number[] = []
    let cursor = 0
    for (let ci = 0; ci < clusters.length; ci++) {
      const cl = clusters[ci]
      if (ci === 0) {
        clusterCenters.push(0)
        cursor = cl.widthY * 0.5
      } else {
        const c = cursor + interBundleGap + cl.widthY * 0.5
        clusterCenters.push(c)
        cursor = c + cl.widthY * 0.5
      }
    }
    const minEdge = clusters.length > 0 ? clusterCenters[0] - clusters[0].widthY * 0.5 : 0
    const maxEdge = clusters.length > 0 ? cursor : 0
    const totalSpan = Math.max(0, maxEdge - minEdge)
    const centerShift = totalSpan > availSpan && clusterCenters.length > 1
      ? Math.max(0.55, availSpan / totalSpan)
      : 1
    const midCenter = ((minEdge + maxEdge) * 0.5) * centerShift

    const trackPos: Array<{ yOff: number; zOff: number }> = new Array(trackEnds.length)
    for (let ci = 0; ci < clusters.length; ci++) {
      const cl = clusters[ci]
      const baseY = safeCenter + clusterCenters[ci] * centerShift - midCenter - laneVal
      // Se ainda exceder um corredor muito estreito, alterna chicotes pares/ímpares em Z sem desfazer a roseta!
      const extraZ = totalSpan * centerShift > availSpan + 0.03 && (ci % 2 === 1) ? 0.058 : 0
      cl.indices.forEach((trackIdx, m) => {
        trackPos[trackIdx] = { yOff: baseY + cl.localY[m], zOff: cl.localZ[m] + extraZ }
      })
    }

    for (const sp of spans) {
      const t = assignedTrack.get(sp) ?? 0
      const tp = trackPos[t] ?? { yOff: 0, zOff: 0 }
      const frontZ = wireFrontLimit(sp.outerMm)
      const ductZ = frontZ + 0.018 + tp.zOff
      globalMaxOpenDuctZ = Math.max(globalMaxOpenDuctZ, ductZ)
      const s = slots.get(sp.wireId)!
      if (sp.side === 'A') {
        s.yOffsetA = tp.yOff; s.ductZA = ductZ
        if (s.yOffsetB === undefined) { s.yOffsetB = tp.yOff; s.ductZB = ductZ }
      } else {
        s.yOffsetB = tp.yOff; s.ductZB = ductZ
      }
    }
  }

  // 2) Colunas verticais entre calhas (risers e calhas verticais CT5/CT2): agrupa por `bundleId` em feixe compacto!
  const byRiser = new Map<string, { inDuct: boolean; riserX: number; list: Entry[] }>()
  for (const e of entries) {
    if (e.basePlan?.riserX === undefined) continue
    const inDuct = Boolean(e.basePlan.inDuct)
    const rx = Math.round(e.basePlan.riserX * 100) / 100
    const key = `${inDuct ? 'D' : 'O'}:${rx}`
    const g = byRiser.get(key) ?? { inDuct, riserX: rx, list: [] }
    g.list.push(e)
    byRiser.set(key, g)
  }
  for (const { inDuct, list } of byRiser.values()) {
    list.sort((a, b) =>
      (a.wire.bundleId ?? '~').localeCompare(b.wire.bundleId ?? '~')
      || (a.from.position[0] - b.from.position[0])
      || a.wire.id.localeCompare(b.wire.id))
    if (inDuct) {
      // Calha técnica vertical real (40 mm de largura): até 6 pistas em X × camadas em Z dentro do canal!
      const maxCols = 6
      const colsUsed = Math.min(list.length, maxCols)
      list.forEach((e, idx) => {
        const s = slots.get(e.wire.id)!
        const col = idx % maxCols
        const layer = Math.floor(idx / maxCols)
        s.riserXOffset = (col - (colsUsed - 1) * 0.5) * 0.036
        s.riserZ = wireFrontLimit(e.outerMm) + 0.145 + (layer % 5) * 0.038
      })
    } else {
      // Passagem vertical em painel aberto: cada chicote em feixe encostado (ponte trifásica lado a lado justo ou favo)!
      const groups: Entry[][] = []
      for (const e of list) {
        const prev = groups[groups.length - 1]
        if (prev && e.wire.bundleId && prev[0].wire.bundleId === e.wire.bundleId) prev.push(e)
        else groups.push([e])
      }
      const xVals: number[] = []
      const zVals: number[] = []
      let curX = 0
      groups.forEach((grp, gi) => {
        const p = Math.max(0.0305, Math.max(...grp.map((e) => e.outerMm)) * U + 0.0014)
        const k = grp.length
        const bot = k <= 3 ? k : Math.ceil(k / 2)
        const top = k - bot
        const wX = bot * p
        const cX = gi === 0 ? 0 : curX + 0.052 + wX * 0.5
        curX = gi === 0 ? wX * 0.5 : cX + wX * 0.5
        grp.forEach((_, m) => {
          if (m < bot) {
            xVals.push(cX + (m - (bot - 1) * 0.5) * p)
            zVals.push(0)
          } else {
            const ti = m - bot
            const shift = top === bot ? 0.25 * p : 0
            xVals.push(cX + (ti - (top - 1) * 0.5) * p + shift)
            zVals.push(p * 0.88)
          }
        })
      })
      const midX = xVals.length > 0 ? (Math.min(...xVals) + Math.max(...xVals)) * 0.5 : 0
      list.forEach((e, idx) => {
        const s = slots.get(e.wire.id)!
        s.riserXOffset = xVals[idx] - midX
        s.riserZ = globalMaxOpenDuctZ + 0.044 + zVals[idx]
      })
    }
  }

  // 3) Subidas/descidas verticais junto aos bornes: desfasar apenas quando dois bornes partilham a mesma coluna X e faixa Y.
  type DropInfo = { wireId: string; side: 'A' | 'B'; x: number; y: number; inDuct: boolean; outerMm: number }
  const drops: DropInfo[] = []
  for (const e of entries) {
    if (!e.basePlan) continue
    const inDuct = Boolean(e.basePlan.inDuct)
    drops.push({ wireId: e.wire.id, side: 'A', x: e.from.position[0], y: e.from.position[1], inDuct, outerMm: e.outerMm })
    drops.push({ wireId: e.wire.id, side: 'B', x: e.to.position[0], y: e.to.position[1], inDuct, outerMm: e.outerMm })
  }
  drops.sort((a, b) => a.x - b.x || a.y - b.y)
  const activeCols: Array<{ x: number; y: number; vLayer: number }> = []
  for (const d of drops) {
    let vLayer = 0
    let stackedCol = false
    const used = new Set<number>()
    for (const prev of activeCols) {
      if (Math.abs(prev.x - d.x) < 0.038 && Math.abs(prev.y - d.y) < 0.55) {
        used.add(prev.vLayer)
        if (Math.abs(prev.y - d.y) > 0.015) stackedCol = true
      }
    }
    while (used.has(vLayer)) vLayer += 1
    activeCols.push({ x: d.x, y: d.y, vLayer })
    const s = slots.get(d.wireId)!
    const baseZ = d.inDuct ? wireFrontLimit(d.outerMm) + 0.22 : globalMaxOpenDuctZ + 0.046
    const zVal = baseZ + (vLayer % 4) * 0.040
    // Quando dois bornes DISTINTOS estão na mesma coluna vertical (ex.: B0.21 sobre B0.22, não ponteira dupla no mesmo borne),
    // desfasa ligeiramente X para o fio superior descer em paralelo limpo sem tocar na ponteira inferior!
    const xNudge = 0
    if (d.side === 'A') { s.vertZA = zVal; s.xStepA = xNudge }
    else { s.vertZB = zVal; s.xStepB = xNudge }
  }

  // 4) Construir os traçados suaves iniciais com os canais atribuídos.
  const smooth01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))
  const ductBoxes = obstacles.filter((b) => b.duct)
  const inAnyDuct = (p: THREE.Vector3) =>
    ductBoxes.some((d) =>
      p.x >= d.min.x - 0.01 && p.x <= d.max.x + 0.01
      && p.y >= d.min.y - 0.01 && p.y <= d.max.y + 0.01
      && p.z >= d.min.z - 0.02 && p.z <= d.max.z + 0.02)

  const subdivideExterior = (raw: THREE.Vector3[], fromGland: boolean, toGland: boolean, fixedCount: number, guard: number, maxSeg = 0.085): THREE.Vector3[] => {
    if (raw.length < 2) return raw
    const lo = fromGland ? Math.max(0, Math.min(raw.length - 1, fixedCount - 1)) : 0
    const hi = toGland ? Math.max(lo, raw.length - fixedCount) : raw.length - 1
    const rawCum = [0]
    for (let i = 1; i < raw.length; i++) rawCum.push(rawCum[i - 1] + raw[i].distanceTo(raw[i - 1]))
    const sStart = rawCum[lo]
    const sEnd = rawCum[hi]
    const out: THREE.Vector3[] = []
    for (let i = 0; i < raw.length - 1; i++) {
      const a = raw[i], b = raw[i + 1]
      out.push(a.clone())
      if (i >= lo && i < hi) {
        const len = rawCum[i + 1] - rawCum[i]
        // Só subdivide troços retos longos fora das ponteiras (mantém as pontas 100% axiais e o cálculo ultrarrápido!).
        const segMid = (rawCum[i] + rawCum[i + 1]) * 0.5
        const outsideStub = (i > lo || len > guard * 1.35) && (i < hi - 1 || len > guard * 1.35)
        if (outsideStub && len > maxSeg * 1.25 && (segMid > sStart + guard * 0.6 || len > 0.24) && (segMid < sEnd - guard * 0.6 || len > 0.24)) {
          const steps = Math.min(64, Math.ceil(len / maxSeg))
          for (let s = 1; s < steps; s++) {
            const sPt = rawCum[i] + len * (s / steps)
            // Nunca coloca vértices extra nos primeiros/últimos 11 mm junto à ponteira!
            if (!fromGland && sPt < sStart + guard * 0.92) continue
            if (!toGland && sPt > sEnd - guard * 0.92) continue
            out.push(a.clone().lerp(b, s / steps))
          }
        }
      }
    }
    out.push(raw[raw.length - 1].clone())
    return out
  }

  const measureArc = (chain: THREE.Vector3[]) => {
    const cum = new Array<number>(chain.length).fill(0)
    for (let i = 1; i < chain.length; i++) cum[i] = cum[i - 1] + chain[i].distanceTo(chain[i - 1])
    return cum
  }

  const builtPaths = entries.map((e) => {
    const path = buildWirePath3D(e.wire, e.from, e.to, obstacles, slots.get(e.wire.id))
    const fromGland = isMotorGlandEligible(e.from, endTypeOf(e.wire, 'from')) && !e.to.motorContext
    const toGland = isMotorGlandEligible(e.to, endTypeOf(e.wire, 'to')) && !e.from.motorContext
    const fProbe = endTypeOf(e.wire, 'from') === 'probe' || endTypeOf(e.wire, 'to') === 'probe'
    const panelSide = toGland ? e.from : fromGland ? e.to : undefined
    const motorGlandEnc = !fProbe && panelSide
      ? enclosureContainingPoint(panelSide.position, enclosures, panelSide.enclosureId)?.id
      : undefined
    const doorEncA = e.from.doorContext?.enclosureId
    const doorEncB = e.to.doorContext?.enclosureId
    const basePts = removeBacktracksOutsideMotor(path.points, path.motorRoute).map((p) => new THREE.Vector3(p[0], p[1], p[2]))
    const fixedCount = path.motorRoute?.points.length ?? 0
    const hasManual = Boolean(e.wire.waypoints3D && e.wire.waypoints3D.length > 0)
    const guard = Math.max(0.11, e.outerMm * 3.8 * U)
    const pts = e.wire.bundleId && !fProbe && !hasManual
      ? subdivideExterior(basePts, fromGland, toGland, fixedCount, guard, 0.105)
      : basePts
    const pinPoints = (chain: THREE.Vector3[]) => {
      const count = chain.length
      const distances = measureArc(chain)
      const total = distances[count - 1] ?? 0
      return chain.map((_, idx) =>
        idx <= 1 || idx >= count - 2
        || distances[idx] <= guard
        || total - distances[idx] <= guard
        || (fromGland && idx < fixedCount)
        || (toGland && idx >= count - fixedCount))
    }
    const pinned = pinPoints(pts)
    const encA = !e.from.doorContext ? enclosureContainingPoint(e.from.position, enclosures, e.from.enclosureId) : undefined
    const encB = !e.to.doorContext ? enclosureContainingPoint(e.to.position, enclosures, e.to.enclosureId) : undefined
    const clampEnc = !fromGland && !toGland && encA && encB && encA.id === encB.id ? encA : undefined
    return {
      entry: e,
      starts: path.starts,
      pts,
      pinned,
      pinPoints,
      guard,
      fromGland,
      toGland,
      fixedCount,
      fProbe,
      hasManual,
      motorRoute: path.motorRoute,
      clampEnc,
      exits: [
        { componentId: e.from.componentId, axis: path.starts[0].axis, glandBypass: fromGland, enclosureGlandId: motorGlandEnc, enclosureDoorId: doorEncA },
        { componentId: e.to.componentId, axis: path.starts[1].axis, glandBypass: toGland, enclosureGlandId: motorGlandEnc, enclosureDoorId: doorEncB },
      ] as Parameters<typeof keepWireOutsideSolids>[3],
      minZ: wireFrontLimit(e.outerMm),
    }
  })

  const checkPathClear = (pts: V3[], outerMm: number, exits: Parameters<typeof keepWireOutsideSolids>[3], motorRoute?: WirePath3D['motorRoute']) => {
    if (!motorRoute) return isWireOutsideSolids(pts, outerMm, obstacles, exits)
    const count = motorRoute.points.length
    const cut = motorRoute.side === 'to' ? Math.max(1, pts.length - count) : Math.min(pts.length - 2, count - 1)
    const sub = motorRoute.side === 'to' ? pts.slice(0, cut + 1) : pts.slice(cut)
    return isWireOutsideSolids(sub, outerMm, obstacles, exits)
  }

  // 4.5) Aperto físico dos chicotes filaçados (`bundleId`): puxa e encosta os condutores paralelos de cada
  // chicote numa roseta circular/hexagonal compacta (com transição C² suave desde os bornes e ligeira cintura
  // de compressão nas estações de abraçadeira PA66), como num quadro industrial filaçado real.
  {
    type CinchMember = {
      item: typeof builtPaths[number]
      orig: THREE.Vector3[]
      cum: number[]
      tang: THREE.Vector3[]
      extLo: number
      extHi: number
      sLo: number
      sHi: number
      guardLo: number
      guardHi: number
      rampLo: number
      rampHi: number
      sumTarget: THREE.Vector3[]
      sumWeight: number[]
    }

    const byBundle = new Map<string, CinchMember[]>()
    for (const item of builtPaths) {
      const bid = item.entry.wire.bundleId
      if (!bid || item.fProbe || item.hasManual || item.pts.length < 4) continue
      const orig = item.pts.map((p) => p.clone())
      const cum = measureArc(orig)
      const extLo = item.fromGland ? Math.min(orig.length - 2, Math.max(0, item.fixedCount - 1)) : 0
      const extHi = item.toGland ? Math.max(extLo + 1, orig.length - item.fixedCount) : orig.length - 1
      const sLo = cum[extLo]
      const sHi = cum[extHi]
      if (sHi - sLo < 0.42) continue
      const tang = orig.map((_, k) => {
        const a = orig[Math.max(extLo, k - 1)]
        const b = orig[Math.min(extHi, k + 1)]
        const d = b.clone().sub(a)
        return d.lengthSq() > 1e-10 ? d.normalize() : new THREE.Vector3(1, 0, 0)
      })
      const m: CinchMember = {
        item,
        orig,
        cum,
        tang,
        extLo,
        extHi,
        sLo,
        sHi,
        guardLo: item.fromGland ? 0.24 : Math.max(0.21, item.guard + 0.08),
        guardHi: item.toGland ? 0.24 : Math.max(0.21, item.guard + 0.08),
        rampLo: item.fromGland ? 0.24 : 0.28,
        rampHi: item.toGland ? 0.24 : 0.28,
        sumTarget: orig.map(() => new THREE.Vector3()),
        sumWeight: new Array<number>(orig.length).fill(0),
      }
      const list = byBundle.get(bid)
      if (list) list.push(m)
      else byBundle.set(bid, [m])
    }

    const sliceMember = (m: CinchMember, planePt: THREE.Vector3, planeDir: THREE.Vector3, maxReach: number) => {
      let best: { p: THREE.Vector3; dir: THREE.Vector3; s: number; k: number; perp: number } | null = null
      for (let i = m.extLo + 1; i <= m.extHi; i++) {
        const a = m.orig[i - 1], b = m.orig[i]
        const segL = m.cum[i] - m.cum[i - 1]
        if (segL < 1e-7) continue
        const da = (a.x - planePt.x) * planeDir.x + (a.y - planePt.y) * planeDir.y + (a.z - planePt.z) * planeDir.z
        const db = (b.x - planePt.x) * planeDir.x + (b.y - planePt.y) * planeDir.y + (b.z - planePt.z) * planeDir.z
        if ((da > 0 && db > 0) || (da < 0 && db < 0)) {
          if (Math.min(Math.abs(da), Math.abs(db)) > 0.024) continue
        }
        const denom = da - db
        const t = Math.max(0, Math.min(1, Math.abs(denom) > 1e-9 ? da / denom : 0.5))
        const s = m.cum[i - 1] + segL * t
        if (s < m.sLo + m.guardLo || s > m.sHi - m.guardHi) continue
        const px = a.x + (b.x - a.x) * t
        const py = a.y + (b.y - a.y) * t
        const pz = a.z + (b.z - a.z) * t
        const ox = px - planePt.x, oy = py - planePt.y, oz = pz - planePt.z
        const ax = ox * planeDir.x + oy * planeDir.y + oz * planeDir.z
        if (Math.abs(ax) > 0.028) continue
        const rx = ox - planeDir.x * ax, ry = oy - planeDir.y * ax, rz = oz - planeDir.z * ax
        const perp = Math.hypot(rx, ry, rz)
        if (perp > maxReach) continue
        if (!best || perp < best.perp) {
          const nearK = t < 0.5 ? i - 1 : i
          best = { p: new THREE.Vector3(px, py, pz), dir: m.tang[nearK], s, k: nearK, perp }
        }
      }
      return best
    }

    const isLocallyGentle = (m: CinchMember, k: number) => {
      const s0 = m.cum[k]
      let kA = k, kB = k
      while (kA > m.extLo && s0 - m.cum[kA] < 0.085) kA--
      while (kB < m.extHi && m.cum[kB] - s0 < 0.085) kB++
      return m.tang[kA].dot(m.tang[kB]) >= 0.88 && m.tang[k].dot(m.tang[kA]) >= 0.91 && m.tang[k].dot(m.tang[kB]) >= 0.91
    }

    const GATHER_REACH = 0.26 // 26 mm de alcance transversal para reunir o chicote
    const LINK_GAP = 0.185 // 18,5 mm de folga máx. entre vizinhos para fechar num único feixe apertado

    for (const members of byBundle.values()) {
      if (members.length < 2) continue
      const ordered = [...members].sort((a, b) =>
        ((b.sHi - b.sLo) - (a.sHi - a.sLo)) || a.item.entry.wire.id.localeCompare(b.item.entry.wire.id))

      const visitedStations: Array<{ c: THREE.Vector3; key: string }> = []

      for (const lead of ordered) {
        for (let k = lead.extLo + 1; k < lead.extHi; k++) {
          const s = lead.cum[k]
          if (s < lead.sLo + lead.guardLo || s > lead.sHi - lead.guardHi) continue
          const seedP = lead.orig[k]
          if (inAnyDuct(seedP)) continue
          if (!isLocallyGentle(lead, k)) continue
          const seedDir = lead.tang[k]

          type Hit = { m: CinchMember; p: THREE.Vector3; dir: THREE.Vector3; s: number; k: number; r: number }
          const cands: Hit[] = [{ m: lead, p: seedP, dir: seedDir, s, k, r: lead.item.entry.radius }]
          for (const other of ordered) {
            if (other === lead) continue
            const hit = sliceMember(other, seedP, seedDir, GATHER_REACH)
            if (!hit) continue
            if (inAnyDuct(hit.p)) continue
            if (Math.abs(hit.dir.dot(seedDir)) < 0.88) continue
            if (!isLocallyGentle(other, hit.k)) continue
            cands.push({ m: other, p: hit.p, dir: hit.dir, s: hit.s, k: hit.k, r: other.item.entry.radius })
          }
          if (cands.length < 2) continue

          // Componente conexa de proximidade (reúne sub-feixes co-correntes sem puxar troços distantes).
          const cluster: Hit[] = [cands[0]]
          const used = new Set<number>([0])
          let grew = true
          while (grew) {
            grew = false
            for (let ci = 1; ci < cands.length; ci++) {
              if (used.has(ci)) continue
              const cand = cands[ci]
              const linked = cluster.some((mem) => {
                const d = cand.p.clone().sub(mem.p)
                d.addScaledVector(seedDir, -d.dot(seedDir))
                return d.length() - cand.r - mem.r <= LINK_GAP
              })
              if (linked) {
                cluster.push(cand)
                used.add(ci)
                grew = true
              }
            }
          }
          if (cluster.length < 2) continue

          const clusterKey = cluster.map((c) => c.m.item.entry.wire.id).sort().join('|')
          // Tangente média do chicote e centróide ponderado (os fios mais longe do borne ancoram o tronco principal!).
          const axis = new THREE.Vector3()
          const center = new THREE.Vector3()
          let wSum = 0
          for (const h of cluster) {
            const sign = h.dir.dot(seedDir) >= 0 ? 1 : -1
            const dEnd = Math.min(h.s - h.m.sLo, h.m.sHi - h.s)
            const w = (0.35 + smooth01((dEnd - 0.14) / 0.42)) * (h.r * h.r * 1000)
            axis.addScaledVector(h.dir, sign * w)
            center.addScaledVector(h.p, w)
            wSum += w
          }
          if (wSum < 1e-9 || axis.lengthSq() < 1e-9) continue
          axis.normalize()
          center.multiplyScalar(1 / wSum)

          if (visitedStations.some((vs) => vs.key === clusterKey && vs.c.distanceToSquared(center) < 0.068 * 0.068)) {
            continue
          }
          visitedStations.push({ c: center.clone(), key: clusterKey })

          // Referencial transversal canónico sem torção:
          // - troços em XY: `bV` aponta para +Z (frente da chapa);
          // - troços em Z (ex.: topo da fonte PS1): `bV` aponta para +Y (acima da tampa do aparelho).
          const depthRun = Math.abs(axis.z) >= 0.72
          const ref = depthRun ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1)
          const bU = new THREE.Vector3().crossVectors(axis, ref)
          if (bU.lengthSq() < 1e-6) bU.set(1, 0, 0)
          else bU.normalize()
          const bV = new THREE.Vector3().crossVectors(bU, axis).normalize()
          if (!depthRun && bV.z < 0) { bU.negate(); bV.negate() }
          if (depthRun && bV.y < 0) { bU.negate(); bV.negate() }

          // Piso de segurança para a roseta (frente da chapa em XY; topo de aparelho subjacente em Z).
          let vFloor: number | undefined
          if (!depthRun && bV.z > 0.75) {
            const reqZ = Math.max(...cluster.map((h) => h.m.item.minZ)) + 0.004
            vFloor = (reqZ - center.z) / bV.z
          } else if (depthRun && bV.y > 0.75) {
            let roofY = -Infinity
            for (const box of softBoxes) {
              if (center.x >= box.min.x - 0.14 && center.x <= box.max.x + 0.14
                && center.z >= box.min.z - 0.08 && center.z <= box.max.z + 0.08
                && box.max.y <= center.y + 0.03) {
                roofY = Math.max(roofY, box.max.y)
              }
            }
            if (Number.isFinite(roofY)) vFloor = (roofY + 0.085) - center.y
          }

          // Aperto firme e encostado ao longo de todo o chicote + cintura extra nas estações de abraçadeira PA66!
          const phase = Math.cos((Math.PI * s) / TIE_SPACING)
          const tiePinch = phase * phase * phase * phase // [0..1]
          const surfaceGap = 0.0018 - 0.0008 * tiePinch // 0,18 mm no tronco → 0,10 mm na abraçadeira (encostado real!)

          // Ordenação estável por ID de cabo antes do empacotamento para evitar troca de pista entre estações!
          const sortedCluster = [...cluster].sort((a, b) => a.m.item.entry.wire.id.localeCompare(b.m.item.entry.wire.id))
          const packInputs = sortedCluster.map((h) => {
            const rel = h.p.clone().sub(center)
            return { r: h.r, prefU: rel.dot(bU), prefV: rel.dot(bV) }
          })
          const packed = packBundleRosette(packInputs, surfaceGap, vFloor)

          for (let idx = 0; idx < sortedCluster.length; idx++) {
            const h = sortedCluster[idx]
            const { u, v: pv } = packed[idx]
            const target = center.clone()
              .addScaledVector(bU, u)
              .addScaledVector(bV, pv)
            target.z = Math.max(h.m.item.minZ, target.z)

            // Deslocamento PURAMENTE transversal ao feixe (zero componente axial → NUNCA cria dobra para trás!).
            const delta = target.sub(h.p)
            delta.addScaledVector(axis, -delta.dot(axis))

            const m = h.m
            const WIN_S = 0.095
            for (let vk = m.extLo + 1; vk < m.extHi; vk++) {
              const ds = Math.abs(m.cum[vk] - h.s)
              if (ds >= WIN_S) continue
              const wk = 0.5 * (1 + Math.cos((Math.PI * ds) / WIN_S))
              if (wk <= 1e-4) continue
              m.sumTarget[vk].addScaledVector(delta, wk)
              m.sumWeight[vk] += wk
            }
          }
        }
      }

      // Aplica o deslocamento transversal de aperto com rampa Hermite C² suave na saída/entrada de bornes e derivações!
      for (const m of members) {
        const n = m.orig.length
        const rawDisp = m.orig.map(() => new THREE.Vector3())
        const hasTarget = m.sumWeight.map((w) => w > 0.05)

        // Identifica troços contíguos filaçados e ignora cruzamentos fugazes (< 20 mm).
        const runs: Array<[number, number]> = []
        let rStart = -1
        for (let k = m.extLo + 1; k < m.extHi; k++) {
          if (hasTarget[k] && rStart < 0) rStart = k
          else if (!hasTarget[k] && rStart >= 0) {
            if (k + 1 < m.extHi && hasTarget[k + 1]) continue
            runs.push([rStart, k - 1])
            rStart = -1
          }
        }
        if (rStart >= 0) runs.push([rStart, m.extHi - 1])

        let moved = false
        for (const [a, b] of runs) {
          const runSpan = m.cum[b] - m.cum[a]
          if (runSpan < 0.18) continue
          const nearStartEnd = m.cum[a] - m.sLo < m.guardLo + 0.14
          const nearFinishEnd = m.sHi - m.cum[b] < m.guardHi + 0.14
          for (let k = a; k <= b; k++) {
            const w = m.sumWeight[k]
            let delta: THREE.Vector3
            if (w > 0.05) {
              delta = m.sumTarget[k].clone().multiplyScalar(1 / w)
            } else {
              const dPrev = m.sumTarget[k - 1].clone().multiplyScalar(1 / Math.max(1e-6, m.sumWeight[k - 1]))
              const dNext = m.sumTarget[k + 1].clone().multiplyScalar(1 / Math.max(1e-6, m.sumWeight[k + 1]))
              delta = dPrev.lerp(dNext, 0.5)
            }
            const aLo = smooth01((m.cum[k] - m.sLo - m.guardLo) / m.rampLo)
            const aHi = smooth01((m.sHi - m.cum[k] - m.guardHi) / m.rampHi)
            const aIn = nearStartEnd ? 1 : smooth01((m.cum[k] - m.cum[a] + 0.05) / 0.28)
            const aOut = nearFinishEnd ? 1 : smooth01((m.cum[b] - m.cum[k] + 0.05) / 0.28)
            const alpha = 0.97 * Math.min(aLo, aHi, aIn, aOut)
            if (alpha <= 1e-4) continue
            rawDisp[k].copy(delta).multiplyScalar(alpha)
            moved = true
          }
        }
        if (!moved) continue

        // Suavização cosseno em comprimento de arco (raio 28 mm) sobre o campo de deslocamento:
        // espalha as transições de entrada/saída do chicote em curvas naturais C² sem NENHUM vinco!
        const SMOOTH_R = 0.28
        const wallMargin = m.item.entry.radius + 0.048
        const buildCandidateFrom = (base: THREE.Vector3[], rLo: number, rHi: number, blend: number) => {
          const out = base.map((p) => p.clone())
          for (let k = Math.max(m.extLo + 1, rLo - 6); k <= Math.min(m.extHi - 1, rHi + 6); k++) {
            const sK = m.cum[k]
            const termFade = Math.min(
              smooth01((sK - m.sLo - m.guardLo) / (m.rampLo * 0.9)),
              smooth01((m.sHi - sK - m.guardHi) / (m.rampHi * 0.9)),
            )
            if (termFade <= 1e-4) continue
            let sx = 0, sy = 0, sz = 0, sw = 0
            for (let j = k; j >= m.extLo; j--) {
              const ds = sK - m.cum[j]
              if (ds > SMOOTH_R) break
              const gw = 0.5 * (1 + Math.cos((Math.PI * ds) / SMOOTH_R))
              if (j >= rLo && j <= rHi) { sx += rawDisp[j].x * gw; sy += rawDisp[j].y * gw; sz += rawDisp[j].z * gw }
              sw += gw
            }
            for (let j = k + 1; j <= m.extHi; j++) {
              const ds = m.cum[j] - sK
              if (ds > SMOOTH_R) break
              const gw = 0.5 * (1 + Math.cos((Math.PI * ds) / SMOOTH_R))
              if (j >= rLo && j <= rHi) { sx += rawDisp[j].x * gw; sy += rawDisp[j].y * gw; sz += rawDisp[j].z * gw }
              sw += gw
            }
            if (sw <= 1e-6 || (Math.abs(sx) + Math.abs(sy) + Math.abs(sz) < 1e-8)) continue
            const scaleK = (blend * Math.min(1, termFade * 1.12)) / sw
            // Projeta estritamente na normal local do cabo → zero recuo axial mesmo junto a curvas de 90°!
            let dx = sx * scaleK, dy = sy * scaleK, dz = sz * scaleK
            const tK = m.tang[k]
            const along = dx * tK.x + dy * tK.y + dz * tK.z
            dx -= tK.x * along; dy -= tK.y * along; dz -= tK.z * along
            let nx = base[k].x + dx
            let ny = base[k].y + dy
            let nz = Math.max(m.item.minZ, base[k].z + dz)
            if (m.item.clampEnc) {
              nx = Math.max(m.item.clampEnc.minX + wallMargin, Math.min(m.item.clampEnc.maxX - wallMargin, nx))
              ny = Math.max(m.item.clampEnc.minY + wallMargin, Math.min(m.item.clampEnc.maxY - wallMargin, ny))
              nz = Math.min(m.item.clampEnc.frontZ - wallMargin, nz)
            }
            out[k].set(nx, ny, nz)
          }
          return out
        }

        const hasNoFoldback = (chain: THREE.Vector3[]) => {
          for (let k = Math.max(1, m.extLo); k < Math.min(chain.length - 1, m.extHi); k++) {
            const ab = chain[k].clone().sub(chain[k - 1])
            const bc = chain[k + 1].clone().sub(chain[k])
            const l1 = ab.length(), l2 = bc.length()
            if (l1 < 1e-5 || l2 < 1e-5) continue
            if (ab.dot(bc) / (l1 * l2) < 0.25) return false
          }
          return true
        }

        // Valida primeiro de uma só vez; se um troço roçar num aparelho, valida troço a troço para não soltar o resto do chicote!
        const fullCand = buildCandidateFrom(m.orig, m.extLo + 1, m.extHi - 1, 1.0)
        if (hasNoFoldback(fullCand) && checkPathClear(fullCand.map(arr), m.item.entry.outerMm, m.item.exits, m.item.motorRoute)) {
          for (let k = 0; k < n; k++) m.item.pts[k].copy(fullCand[k])
          m.item.pinned = m.item.pinPoints(m.item.pts)
        } else {
          let cur = m.orig.map((p) => p.clone())
          let anyApplied = false
          for (const [rA, rB] of runs) {
            if (m.cum[rB] - m.cum[rA] < 0.18) continue
            for (const blend of [1.0, 0.72, 0.45]) {
              const trial = buildCandidateFrom(cur, rA, rB, blend)
              if (hasNoFoldback(trial) && checkPathClear(trial.map(arr), m.item.entry.outerMm, m.item.exits, m.item.motorRoute)) {
                cur = trial
                anyApplied = true
                break
              }
            }
          }
          if (anyApplied) {
            for (let k = 0; k < n; k++) m.item.pts[k].copy(cur[k])
            m.item.pinned = m.item.pinPoints(m.item.pts)
          }
        }
      }
    }

    // Compacta troços retos intermédios já perfeitamente colineares antes da relaxação (preserva pontas intactas!).
    for (const item of builtPaths) {
      if (!item.entry.wire.bundleId || item.fProbe || item.hasManual || item.pts.length < 28) continue
      const lo = (item.fromGland ? Math.max(0, Math.min(item.pts.length - 1, item.fixedCount - 1)) : 0) + 12
      const hi = (item.toGland ? Math.max(0, item.pts.length - item.fixedCount) : item.pts.length - 1) - 12
      if (hi <= lo + 2) continue
      const slim: THREE.Vector3[] = []
      for (let i = 0; i <= lo; i++) slim.push(item.pts[i])
      for (let i = lo + 1; i < hi; i++) {
        const prev = slim[slim.length - 1]
        const curr = item.pts[i]
        const next = item.pts[i + 1]
        const l1 = curr.distanceTo(prev), l2 = next.distanceTo(curr)
        if (l1 < 0.004) continue
        if (l2 > 0.004 && l1 + l2 < 0.24) {
          const cosA = curr.clone().sub(prev).dot(next.clone().sub(curr)) / (l1 * l2)
          if (cosA > 0.9999) continue
        }
        slim.push(curr)
      }
      for (let i = hi; i < item.pts.length; i++) slim.push(item.pts[i])
      item.pts = slim
      item.pinned = item.pinPoints(item.pts)
    }
  }

  // 5) Relaxação geométrica 3D cápsula-a-cápsula com janela cosseno real em comprimento de arco (22 mm):
  //    - dentro do MESMO chicote (`bundleId`): folga mínima de 0,03 mm → mantém os cabos encostados e apertados!
  //    - entre chicotes distintos / cabos soltos: folga limpa de 0,50 mm sem criar vincos junto às ponteiras!
  const RELAX_HALF_ARC = 0.22 // 22 mm para cada lado → zero micro-vincos de 40–60°!
  const maxPasses = 22
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let anyCollision = false
    const touched = new Uint8Array(builtPaths.length)
    const arcs = builtPaths.map((item) => measureArc(item.pts))
    const boxes = builtPaths.map((item) => new THREE.Box3().setFromPoints(item.pts).expandByScalar(item.entry.radius + 0.01))
    for (let i = 0; i < builtPaths.length; i += 1) {
      const A = builtPaths[i]
      const boxA = boxes[i]
      const arcA = arcs[i]
      const totA = arcA[arcA.length - 1] ?? 0
      for (let j = i + 1; j < builtPaths.length; j += 1) {
        const B = builtPaths[j]
        if (!boxA.intersectsBox(boxes[j])) continue
        const arcB = arcs[j]
        const totB = arcB[arcB.length - 1] ?? 0

        const wA = A.entry.wire
        const wB = B.entry.wire
        const sameBundle = Boolean(wA.bundleId && wA.bundleId === wB.bundleId)
        const sharedPositions: THREE.Vector3[] = []
        if (wA.fromTerminalId && (wA.fromTerminalId === wB.fromTerminalId || wA.fromTerminalId === wB.toTerminalId)) {
          sharedPositions.push(A.pts[0])
        }
        if (wA.toTerminalId && (wA.toTerminalId === wB.fromTerminalId || wA.toTerminalId === wB.toTerminalId)) {
          sharedPositions.push(A.pts[A.pts.length - 1])
        }

        const baseGap = sameBundle ? 0.0012 : 0.0055
        const reqDist = A.entry.radius + B.entry.radius + baseGap
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
            const sHitA = arcA[s1] + (arcA[s1 + 1] - arcA[s1]) * hit.s
            const sHitB = arcB[s2] + (arcB[s2 + 1] - arcB[s2]) * hit.t
            const nearTerm = Math.min(sHitA, totA - sHitA, sHitB, totB - sHitB) < 0.28
            const effReq = nearTerm ? A.entry.radius + B.entry.radius + 0.001 : reqDist
            if (hit.dist >= effReq) continue
            if (sharedPositions.some((sp) => sp.distanceTo(hit.c1) < 0.21 || sp.distanceTo(hit.c2) < 0.21)) continue
            if (A.pinned[s1] && A.pinned[s1 + 1] && B.pinned[s2] && B.pinned[s2 + 1]) continue

            anyCollision = true
            touched[i] = 1
            touched[j] = 1
            const extra = sameBundle || nearTerm ? 0.0012 : 0.0024
            const overlap = effReq - hit.dist + extra
            const sep = hit.c1.clone().sub(hit.c2)
            if (sep.lengthSq() < 1e-8) {
              sep.set(0, 0, i > j ? 1 : -1)
            } else {
              sep.normalize()
            }

            const pushChainArc = (
              item: typeof builtPaths[number],
              arc: number[],
              total: number,
              segIdx: number,
              sCenter: number,
              dir: THREE.Vector3,
              amount: number,
            ) => {
              const { pts, pinned, minZ, clampEnc, guard } = item
              const wallMargin = item.entry.radius + 0.048
              const applyAt = (idx: number) => {
                if (idx <= 0 || idx >= pts.length - 1 || pinned[idx]) return true
                const ds = Math.abs(arc[idx] - sCenter)
                if (ds >= RELAX_HALF_ARC) return false
                const cosW = 0.5 * (1 + Math.cos((Math.PI * ds) / RELAX_HALF_ARC))
                const dEnd = Math.min(arc[idx], total - arc[idx])
                const endStiff = smooth01((dEnd - guard) / 0.16)
                const w = cosW * endStiff * amount
                if (w <= 1e-6) return true
                // Projeta na normal local do cabo para nunca recuar sobre o troço fixo da ponteira!
                const tVec = pts[Math.min(pts.length - 1, idx + 1)].clone().sub(pts[Math.max(0, idx - 1)])
                let px = dir.x, py = dir.y, pz = dir.z
                const tLenSq = tVec.lengthSq()
                if (tLenSq > 1e-8) {
                  const proj = (px * tVec.x + py * tVec.y + pz * tVec.z) / tLenSq
                  px -= tVec.x * proj; py -= tVec.y * proj; pz -= tVec.z * proj
                }
                let nx = pts[idx].x + px * w
                let ny = pts[idx].y + py * w
                let nz = Math.max(minZ, pts[idx].z + pz * w)
                if (clampEnc) {
                  nx = Math.max(clampEnc.minX + wallMargin, Math.min(clampEnc.maxX - wallMargin, nx))
                  ny = Math.max(clampEnc.minY + wallMargin, Math.min(clampEnc.maxY - wallMargin, ny))
                  nz = Math.min(clampEnc.frontZ - wallMargin, nz)
                }
                pts[idx].set(nx, ny, nz)
                return true
              }
              for (let idx = segIdx; idx >= 1; idx--) { if (!applyAt(idx)) break }
              for (let idx = segIdx + 1; idx < pts.length - 1; idx++) { if (!applyAt(idx)) break }
              // Evita acumular múltiplos empurrões no mesmo par em segmentos subdivididos.
            }

            const gain = sameBundle ? 0.45 : 0.52
            if (sep.z < -0.25 && A.pts[Math.max(1, s1)].z - overlap * 0.6 <= A.minZ + 0.005) {
              pushChainArc(B, arcB, totB, s2, sHitB, new THREE.Vector3(-sep.x * 0.35, -sep.y * 0.35, Math.abs(sep.z) + 0.65).normalize(), overlap * gain * 1.65)
            } else if (sep.z > 0.25 && B.pts[Math.max(1, s2)].z - overlap * 0.6 <= B.minZ + 0.005) {
              pushChainArc(A, arcA, totA, s1, sHitA, new THREE.Vector3(sep.x * 0.35, sep.y * 0.35, Math.abs(sep.z) + 0.65).normalize(), overlap * gain * 1.65)
            } else {
              pushChainArc(A, arcA, totA, s1, sHitA, sep, overlap * gain)
              pushChainArc(B, arcB, totB, s2, sHitB, sep.clone().negate(), overlap * gain)
            }
          }
        }
      }
    }
    if (anyCollision && pass < maxPasses - 3) {
      for (let idxW = 0; idxW < builtPaths.length; idxW += 1) {
        if (!touched[idxW]) continue
        const item = builtPaths[idxW]
        const copy = item.pts.map((p) => p.clone())
        const arc = arcs[idxW]
        const tot = arc[arc.length - 1] ?? 0
        for (let idx = 2; idx < item.pts.length - 2; idx += 1) {
          if (item.pinned[idx]) continue
          const dEnd = Math.min(arc[idx], tot - arc[idx])
          const blend = 0.14 * smooth01((dEnd - item.guard) / 0.18)
          if (blend <= 1e-4) continue
          const l1 = copy[idx].distanceTo(copy[idx - 1])
          const l2 = copy[idx + 1].distanceTo(copy[idx])
          if (l1 + l2 < 1e-6) continue
          // Interpolação ponderada pelo comprimento de arco (nunca distorce transições entre segmento curto e longo!).
          const wPrev = l2 / (l1 + l2)
          const wNext = l1 / (l1 + l2)
          const avgX = copy[idx - 1].x * wPrev + copy[idx + 1].x * wNext
          const avgY = copy[idx - 1].y * wPrev + copy[idx + 1].y * wNext
          const avgZ = copy[idx - 1].z * wPrev + copy[idx + 1].z * wNext
          item.pts[idx].x = copy[idx].x * (1 - blend) + avgX * blend
          item.pts[idx].y = copy[idx].y * (1 - blend) + avgY * blend
          item.pts[idx].z = Math.max(item.minZ, copy[idx].z * (1 - blend) + avgZ * blend)
        }
      }
    }
    if (pass === 7 || pass === 14 || pass === maxPasses - 1) {
      for (let idxW = 0; idxW < builtPaths.length; idxW += 1) {
        if (!touched[idxW]) continue
        const item = builtPaths[idxW]
        const current = item.pts.map(arr)
        const safe = clearPathSolids(current, item.entry.outerMm, obstacles, item.exits, item.minZ, wireHash(item.entry.wire), item.motorRoute)
        if (safe !== current && safe.length > 1) {
          item.pts = safe.map(v)
          item.pinned = item.pinPoints(item.pts)
          anyCollision = true
        }
      }
    }
    if (!anyCollision) break
  }

  // Simplificação colinear de alta precisão (remove subdivisões retas redundantes mantendo curvas 100% fiéis).
  const compactExterior = (pts: V3[], motorRoute?: WirePath3D['motorRoute']): V3[] => {
    if (pts.length < 28) return pts
    const count = motorRoute?.points.length ?? 0
    const lo = (motorRoute?.side === 'from' ? Math.max(0, Math.min(pts.length - 1, count - 1)) : 0) + 12
    const hi = (motorRoute?.side === 'to' ? Math.max(0, pts.length - count) : pts.length - 1) - 12
    if (hi <= lo + 2) return pts
    const out: V3[] = []
    for (let i = 0; i <= lo; i++) out.push(pts[i])
    for (let i = lo + 1; i < hi; i++) {
      const prev = out[out.length - 1]
      const curr = pts[i]
      const next = pts[i + 1]
      const d1x = curr[0] - prev[0], d1y = curr[1] - prev[1], d1z = curr[2] - prev[2]
      const d2x = next[0] - curr[0], d2y = next[1] - curr[1], d2z = next[2] - curr[2]
      const l1 = Math.hypot(d1x, d1y, d1z), l2 = Math.hypot(d2x, d2y, d2z)
      if (l1 < 1e-4) continue
      if (l2 > 1e-4 && l1 + l2 < 0.36) {
        const cosA = (d1x * d2x + d1y * d2y + d1z * d2z) / (l1 * l2)
        if (cosA > 0.99985) continue
      }
      out.push(curr)
    }
    for (let i = hi; i < pts.length; i++) {
      if (i > lo) out.push(pts[i])
    }
    return out
  }

  // Arredonda cantos vivos residuais com raios progressivos (aceita o maior raio que respeite 100% dos sólidos!).
  const smoothOutsideProgressive = (pts: V3[], outerMm: number, exits: Parameters<typeof keepWireOutsideSolids>[3], motorRoute?: WirePath3D['motorRoute']): V3[] => {
    for (const factor of [1.0, 0.68, 0.45]) {
      const rawCand = smoothOutsideMotor(pts, outerMm * factor, motorRoute)
      if (rawCand === pts) continue
      const cand = factor === 1.0 ? rawCand : keepInFrontOfPlate(rawCand, outerMm)
      if (checkPathClear(cand, outerMm, exits, motorRoute)) return cand
    }
    return pts
  }

  for (const item of builtPaths) {
    const rawPts = item.pts.map(arr)
    const nFix = item.motorRoute?.points.length ?? 0
    const front = nFix > 0 && item.motorRoute
      ? (item.motorRoute.side === 'to'
        ? [...keepInFrontOfPlate(rawPts.slice(0, Math.max(1, rawPts.length - nFix)), item.entry.outerMm), ...item.motorRoute.points]
        : [...item.motorRoute.points, ...keepInFrontOfPlate(rawPts.slice(Math.min(rawPts.length - 1, nFix)), item.entry.outerMm)])
      : keepInFrontOfPlate(rawPts, item.entry.outerMm)
    const cleared = clearPathSolids(front, item.entry.outerMm, obstacles, item.exits, wireFrontLimit(item.entry.outerMm), wireHash(item.entry.wire), item.motorRoute)
    const cleanPoints = cleared.length > 1 ? cleared : front
    const finalPoints = compactExterior(removeBacktracksOutsideMotor(cleanPoints, item.motorRoute), item.motorRoute)
    const smoothed = smoothOutsideProgressive(finalPoints, item.entry.outerMm, item.exits, item.motorRoute)
    const joined = smoothMotorJunction(smoothed, item.motorRoute)
    const despiked = despikeOutsideMotor(joined, item.motorRoute)
    let finalBody = joined
    if (despiked !== joined && checkPathClear(despiked, item.entry.outerMm, item.exits, item.motorRoute)) {
      finalBody = despiked
    } else if (despiked !== joined) {
      // Remove bicos individualmente preservando qualquer vértice essencial ao contorno de obstáculos.
      const nFix = item.motorRoute?.points.length ?? 0
      const work = joined.slice()
      for (let g = 0; g < 40; g++) {
        let hit = false
        const lo = item.motorRoute?.side === 'from' ? Math.max(1, nFix) : 1
        const hi = item.motorRoute?.side === 'to' ? Math.max(lo, work.length - nFix) : work.length - 1
        for (let i = lo; i < hi; i++) {
          const p0 = v(work[i - 1]), p1 = v(work[i]), p2 = v(work[i + 1])
          const a = p1.clone().sub(p0), b = p2.clone().sub(p1)
          const la = a.length(), lb = b.length()
          if (la < 1e-9 || lb < 1e-9 || a.angleTo(b) <= Math.PI / 2) continue
          const delTrial = [...work.slice(0, i), ...work.slice(i + 1)]
          if (checkPathClear(delTrial, item.entry.outerMm, item.exits, item.motorRoute)) {
            work.splice(i, 1)
            hit = true
            break
          }
          const dirA = a.clone().multiplyScalar(1 / la)
          // Se `i` é o ponto de saída que limpa a face frontal do aparelho e `i+1..j-1` mergulharam para trás, salta para `j`!
          for (let j = i + 2; j < hi + 1; j++) {
            const pj = v(work[j])
            const fwd = pj.clone().sub(p1)
            if (fwd.lengthSq() < 1e-6) continue
            const angJ = a.angleTo(fwd)
            if (angJ <= Math.PI * 0.499) {
              const skipTrial = [...work.slice(0, i + 1), ...work.slice(j)]
              if (checkPathClear(skipTrial, item.entry.outerMm, item.exits, item.motorRoute)) {
                work.splice(i + 1, j - (i + 1))
                hit = true
                break
              }
            }
            // Se `pj` já avançou lateralmente o suficiente (≥ 8 mm), liga por cotovelo ortogonal limpo de 90° à frente de `p1`!
            const lat = fwd.clone().addScaledVector(dirA, -fwd.dot(dirA))
            if (lat.length() >= 0.08) {
              const p1Safe = p1.clone().addScaledVector(dirA, 0.004)
              const elbow = arr(p1Safe.clone().add(lat))
              const elbowTrial = [...work.slice(0, i), arr(p1Safe), elbow, ...work.slice(j)]
              const e1 = v(elbow).sub(p1Safe), e2 = pj.clone().sub(v(elbow))
              const e3 = j + 1 < work.length ? v(work[j + 1]).sub(pj) : null
              if (a.angleTo(e1) <= Math.PI * 0.51
                && (e2.length() < 1e-4 || e1.angleTo(e2) <= Math.PI * 0.51)
                && (!e3 || e3.length() < 1e-4 || e2.length() < 1e-4 || e2.angleTo(e3) <= Math.PI * 0.55)
                && checkPathClear(elbowTrial, item.entry.outerMm, item.exits, item.motorRoute)) {
                work.splice(i, j - i, arr(p1Safe), elbow)
                hit = true
                break
              }
            }
          }
          if (hit) break
          const proj = p2.clone().sub(p0).dot(dirA)
          if (proj > 0.015 && proj < la * 0.995) {
            for (const frac of [0.97, 0.9, 0.78]) {
              const pulled = arr(p0.clone().addScaledVector(dirA, Math.max(0.012, proj * frac)))
              const pullTrial = [...work.slice(0, i), pulled, ...work.slice(i + 1)]
              if (checkPathClear(pullTrial, item.entry.outerMm, item.exits, item.motorRoute)) {
                work[i] = pulled
                hit = true
                break
              }
            }
            if (hit) break
          }
        }
        if (!hit) break
      }
      finalBody = smoothOutsideProgressive(work, item.entry.outerMm, item.exits, item.motorRoute)
    }
    const hasProbeEnd = endTypeOf(item.entry.wire, 'from') === 'probe' || endTypeOf(item.entry.wire, 'to') === 'probe'
    const smoothedJoin = hasProbeEnd && item.motorRoute ? smoothMotorRouteJoin(finalBody, item.motorRoute) : { points: finalBody, motorRoute: item.motorRoute }
    result.set(item.entry.wire.id, { points: smoothedJoin.points, starts: item.starts, motorRoute: smoothedJoin.motorRoute })
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

/* ------------------------------------------- diagnóstico e edição de curvas 3D */

export interface WireCurveMetrics3D {
  /** Comprimento real total em mm (incluindo terminações). */
  lengthMm: number
  /** Menor raio de curvatura medido ao longo do cabo (mm); null se totalmente reto. */
  minBendRadiusMm: number | null
  /** Raio mínimo recomendado pela IEC 60204-1 / EN 50565-1 (mm). */
  recommendedMinRadiusMm: number
  /** Maior ângulo de desvio acumulado numa dobra (graus). */
  maxTurnDeg: number
  /** Número de dobras significativas (≥ 22°) ao longo do percurso. */
  bendCount: number
  /** `true` quando todas as curvas respeitam o raio mínimo recomendado (com 15% de tolerância de amostragem). */
  bendOk: boolean
  /** Posição 3D da curva mais apertada (para destaque visual opcional). */
  tightestPoint: V3 | null
}

/**
 * Reamostra uma polilinha 3D a passo uniforme (`stepUnits`) para medir
 * curvatura de Menger sem ruído de micro-segmentos nos arcos.
 */
function resamplePolylineUniform(points: V3[], stepUnits: number): V3[] {
  if (points.length < 2) return points
  const clean: THREE.Vector3[] = [v(points[0])]
  for (let i = 1; i < points.length; i++) {
    const next = v(points[i])
    if (next.distanceTo(clean[clean.length - 1]) > 1e-4) clean.push(next)
  }
  if (clean.length < 2) return clean.map(arr)
  const cum: number[] = [0]
  for (let i = 1; i < clean.length; i++) cum.push(cum[i - 1] + clean[i].distanceTo(clean[i - 1]))
  const total = cum[cum.length - 1]
  if (total < stepUnits * 1.5) return clean.map(arr)
  const count = Math.max(2, Math.min(320, Math.round(total / stepUnits)))
  const out: V3[] = [arr(clean[0])]
  let seg = 1
  for (let s = 1; s < count; s++) {
    const target = (total * s) / count
    while (seg < cum.length - 1 && cum[seg] < target) seg++
    const span = Math.max(1e-6, cum[seg] - cum[seg - 1])
    const u = (target - cum[seg - 1]) / span
    out.push(arr(new THREE.Vector3().lerpVectors(clean[seg - 1], clean[seg], u)))
  }
  out.push(arr(clean[clean.length - 1]))
  return out
}

/**
 * Diagnóstico físico de curvatura de um cabo 3D (comprimento, raio mínimo real
 * por circunferência de Menger, número de dobras e conformidade IEC 60204-1).
 */
export function wireCurveMetrics3D(
  pointsOrPath: WirePath3D | V3[],
  outerMm: number,
  opts?: { multicoreOrRigid?: boolean },
): WireCurveMetrics3D {
  const points = Array.isArray(pointsOrPath) ? pointsOrPath : pointsOrPath.points
  const lengthMm = Array.isArray(pointsOrPath) ? polylineLengthMm(points) : wireLengthMm(pointsOrPath)
  const factor = opts?.multicoreOrRigid ? 5 : 4
  const recommendedMinRadiusMm = Math.round(outerMm * factor * 10) / 10
  if (points.length < 3) {
    return { lengthMm, minBendRadiusMm: null, recommendedMinRadiusMm, maxTurnDeg: 0, bendCount: 0, bendOk: true, tightestPoint: null }
  }

  // Passo de análise proporcional ao diâmetro do cabo, reduzido em cabos curtos para não saltar ganchos apertados
  const stepMm = Math.max(3.5, Math.min(outerMm * 1.8, Math.max(3.5, lengthMm / 8)))
  const sampled = resamplePolylineUniform(points, stepMm * U)
  let minRadiusMm = Infinity
  let maxTurnDeg = 0
  let tightestPoint: V3 | null = null
  let bendCount = 0
  let inBend = false
  let accumRad = 0

  for (let i = 1; i < sampled.length - 1; i++) {
    const a = v(sampled[i - 1]), b = v(sampled[i]), c = v(sampled[i + 1])
    const ab = b.clone().sub(a)
    const bc = c.clone().sub(b)
    const ac = c.clone().sub(a)
    const d1 = ab.length(), d2 = bc.length(), d3 = ac.length()
    if (d1 < 1e-4 || d2 < 1e-4 || d3 < 1e-4) continue
    const turn = ab.angleTo(bc)
    if (turn > 0.11) {
      accumRad += turn
      const area2 = new THREE.Vector3().crossVectors(ab, bc).length()
      if (area2 > 1e-7) {
        const radiusMm = ((d1 * d2 * d3) / (2 * area2)) / U
        if (radiusMm < minRadiusMm) {
          minRadiusMm = radiusMm
          tightestPoint = sampled[i]
        }
      }
      if (!inBend && accumRad >= (22 * Math.PI) / 180) {
        bendCount += 1
        inBend = true
      }
      const deg = (accumRad * 180) / Math.PI
      if (deg > maxTurnDeg) maxTurnDeg = deg
    } else {
      inBend = false
      accumRad = 0
    }
  }

  const hasBend = Number.isFinite(minRadiusMm) && minRadiusMm < 999
  const roundedMin = hasBend ? Math.max(1, Math.round(minRadiusMm * 10) / 10) : null
  const bendOk = roundedMin === null || roundedMin >= recommendedMinRadiusMm * 0.85
  return {
    lengthMm,
    minBendRadiusMm: roundedMin,
    recommendedMinRadiusMm,
    maxTurnDeg: Math.min(180, Math.round(maxTurnDeg)),
    bendCount,
    bendOk,
    tightestPoint: hasBend ? tightestPoint : null,
  }
}

/**
 * Escolhe o ponto ótimo ao longo do percurso real de um cabo 3D para inserir um
 * novo waypoint (meio do troço reto mais longo, sempre à frente da chapa).
 */
export function sampleCurveInsertPoint3D(path: WirePath3D, outerMm: number): SpatialPoint3D {
  const pts = path.points
  const frontZ = wireFrontLimit(outerMm)
  if (pts.length < 2) return { x: 0, y: 0, z: frontZ + 0.06 }
  // Procura o segmento reto mais longo fora dos 8% iniciais/finais (longe das ponteiras)
  let bestIdx = Math.floor((pts.length - 1) / 2)
  let bestLen = -1
  const lo = pts.length > 6 ? 1 : 0
  const hi = pts.length > 6 ? pts.length - 2 : pts.length - 1
  for (let i = lo; i < hi; i++) {
    const len = v(pts[i + 1]).distanceTo(v(pts[i]))
    if (len > bestLen) { bestLen = len; bestIdx = i }
  }
  const a = pts[bestIdx], b = pts[Math.min(pts.length - 1, bestIdx + 1)]
  return {
    x: Math.round(((a[0] + b[0]) / 2) * 1000) / 1000,
    y: Math.round(((a[1] + b[1]) / 2) * 1000) / 1000,
    z: Math.round(Math.max(frontZ + 0.02, (a[2] + b[2]) / 2) * 1000) / 1000,
  }
}

/**
 * Alinha uma lista de waypoints 3D aos eixos X/Y/Z (cotovelos limpos a 90°),
 * mantendo o cabo sempre à frente da chapa e fora dos obstáculos sólidos.
 */
export function orthogonalizeWaypoints3D(
  from: V3,
  waypoints: SpatialPoint3D[],
  to: V3,
  outerMm: number,
  obstacles: WireObstacle[] = [],
): SpatialPoint3D[] {
  if (!waypoints.length) return []
  const frontZ = wireFrontLimit(outerMm)
  const snapThresh = 0.09 // 9 mm: alinha quase-ortogonais diretamente sem criar micro-degrau
  const raw: V3[] = [from, ...waypoints.map(fromSpatial), to]
  const out: V3[] = [from]

  for (let i = 1; i < raw.length; i++) {
    const prev = out[out.length - 1]
    const target: V3 = i === raw.length - 1
      ? raw[i]
      : [
          Math.abs(raw[i][0] - prev[0]) < snapThresh ? prev[0] : raw[i][0],
          Math.abs(raw[i][1] - prev[1]) < snapThresh ? prev[1] : raw[i][1],
          Math.max(frontZ, Math.abs(raw[i][2] - prev[2]) < snapThresh ? prev[2] : raw[i][2]),
        ]
    const dx = Math.abs(target[0] - prev[0])
    const dy = Math.abs(target[1] - prev[1])
    const dz = Math.abs(target[2] - prev[2])
    const zSafe = Math.max(frontZ, prev[2], target[2])
    if (dx > 0.035 && dy > 0.035) {
      // Escolhe o cotovelo L mais livre de obstáculos (primeiro Y→X ou primeiro X→Y)
      const elbowYX: V3 = [prev[0], target[1], zSafe]
      const elbowXY: V3 = [target[0], prev[1], zSafe]
      const exits: Parameters<typeof isWireOutsideSolids>[3] = [
        { axis: [0, 0, 1] },
        { axis: [0, 0, 1] },
      ]
      const clearYX = obstacles.length === 0 || isWireOutsideSolids([prev, elbowYX, target], outerMm, obstacles, exits)
      const clearXY = obstacles.length === 0 || isWireOutsideSolids([prev, elbowXY, target], outerMm, obstacles, exits)
      const preferYX = (clearYX && !clearXY) || (clearYX === clearXY && dy >= dx)
      const elbow = preferYX ? elbowYX : elbowXY
      if (dz > 0.045 && elbow[2] > prev[2] + 0.02) out.push([prev[0], prev[1], elbow[2]])
      out.push(elbow)
    } else if (dz > 0.045 && (dx > 0.035 || dy > 0.035)) {
      out.push([prev[0], prev[1], zSafe])
      out.push([target[0], target[1], zSafe])
    }
    if (i < raw.length - 1) out.push(target)
  }
  out.push(to)
  const simplified = simplifyWaypoints3D(from, out.slice(1, -1).map(toSpatial), to, 0.022)
  return simplified.map((p) => ({
    x: Math.round(p.x * 1000) / 1000,
    y: Math.round(p.y * 1000) / 1000,
    z: Math.round(Math.max(frontZ, p.z) * 1000) / 1000,
  }))
}

/** Remove waypoints 3D colineares ou quase coincidentes sem perder a geometria do cabo. */
export function simplifyWaypoints3D(
  from: V3,
  waypoints: SpatialPoint3D[],
  to: V3,
  toleranceUnits = 0.025,
): SpatialPoint3D[] {
  if (!waypoints.length) return []
  const chain: THREE.Vector3[] = [v(from)]
  for (const wp of waypoints) {
    const pt = v(fromSpatial(wp))
    if (pt.distanceTo(chain[chain.length - 1]) >= toleranceUnits) chain.push(pt)
  }
  const endV = v(to)
  if (chain.length > 1 && chain[chain.length - 1].distanceTo(endV) < toleranceUnits) chain.pop()
  chain.push(endV)
  if (chain.length <= 2) return []

  const kept: THREE.Vector3[] = [chain[0]]
  const line = new THREE.Line3()
  const proj = new THREE.Vector3()
  for (let i = 1; i < chain.length - 1; i++) {
    const prev = kept[kept.length - 1], curr = chain[i], next = chain[i + 1]
    line.set(prev, next)
    line.closestPointToPoint(curr, true, proj)
    if (proj.distanceTo(curr) <= toleranceUnits) continue
    kept.push(curr)
  }
  return kept.slice(1).map((p) => ({
    x: Math.round(p.x * 1000) / 1000,
    y: Math.round(p.y * 1000) / 1000,
    z: Math.round(p.z * 1000) / 1000,
  }))
}

export interface SnapGuideLine3D {
  axis: 'x' | 'y' | 'z' | 'duct'
  from: V3
  to: V3
  color: string
}

export interface WaypointSnapResult3D {
  point: V3
  guides: SnapGuideLine3D[]
  label: string | null
  inDuct: boolean
}

/**
 * Encaixe magnético 3D ao construir cabos ou arrastar pontos de curva:
 * - encaixa no interior de calhas técnicas ranuradas (`duct`) quando o cursor passa sobre elas
 * - alinha magneticamente coordenadas X, Y e Z com pontos vizinhos e bornes
 * - com `axisLock` (Shift), bloqueia estritamente no eixo X, Y ou Z dominante a partir de `anchor`
 */
export function snapControlPoint3D(
  raw: V3,
  opts: {
    anchor?: V3 | null
    references?: V3[]
    obstacles?: WireObstacle[]
    outerMm?: number
    axisLock?: boolean
    magnetic?: boolean
    fine?: boolean
    gridStep?: number
  } = {},
): WaypointSnapResult3D {
  const outerMm = opts.outerMm ?? 2.8
  const frontZ = wireFrontLimit(outerMm)
  let x = raw[0], y = raw[1], z = Math.max(frontZ, raw[2])
  const guides: SnapGuideLine3D[] = []
  const labels: string[] = []
  let inDuct = false

  if (opts.fine) {
    return { point: [x, y, z], guides, label: 'Fino', inDuct: false }
  }

  // 1) Bloqueio estrito de eixo (Shift) em relação ao ponto anterior
  if (opts.axisLock && opts.anchor) {
    const a = opts.anchor
    const dx = Math.abs(x - a[0]), dy = Math.abs(y - a[1]), dz = Math.abs(z - a[2])
    if (dx >= dy && dx >= dz) {
      y = a[1]; z = Math.max(frontZ, a[2])
      guides.push({ axis: 'x', from: a, to: [x, y, z], color: '#ef4444' })
      labels.push('Eixo X')
    } else if (dy >= dz) {
      x = a[0]; z = Math.max(frontZ, a[2])
      guides.push({ axis: 'y', from: a, to: [x, y, z], color: '#16a34a' })
      labels.push('Eixo Y')
    } else {
      x = a[0]; y = a[1]
      guides.push({ axis: 'z', from: a, to: [x, y, z], color: '#2563eb' })
      labels.push('Eixo Z')
    }
    if (opts.gridStep && opts.gridStep > 0) {
      if (labels[0] === 'Eixo X') x = Math.round(x / opts.gridStep) * opts.gridStep
      else if (labels[0] === 'Eixo Y') y = Math.round(y / opts.gridStep) * opts.gridStep
      else z = Math.max(frontZ, Math.round(z / opts.gridStep) * opts.gridStep)
      guides[0].to = [x, y, z]
    }
    return { point: [x, y, z], guides, label: labels.join(' · '), inDuct: false }
  }

  // 2) Encaixe magnético no eixo central de calhas técnicas (wireDuct)
  const ducts = (opts.obstacles ?? []).filter((b) => b.duct)
  for (const duct of ducts) {
    const margin = 0.045
    if (x >= duct.min.x - margin && x <= duct.max.x + margin && y >= duct.min.y - margin && y <= duct.max.y + margin) {
      const spanX = duct.max.x - duct.min.x
      const spanY = duct.max.y - duct.min.y
      const ductZ = Math.max(frontZ + 0.015, duct.min.z + (duct.max.z - duct.min.z) * 0.45)
      if (spanX >= spanY) {
        const cy = (duct.min.y + duct.max.y) / 2
        if (Math.abs(y - cy) < spanY * 0.55) {
          y = cy; z = ductZ; inDuct = true
          guides.push({ axis: 'duct', from: [duct.min.x, cy, ductZ], to: [duct.max.x, cy, ductZ], color: '#0284c7' })
          labels.push('Calha H')
        }
      } else {
        const cx = (duct.min.x + duct.max.x) / 2
        if (Math.abs(x - cx) < spanX * 0.55) {
          x = cx; z = ductZ; inDuct = true
          guides.push({ axis: 'duct', from: [cx, duct.min.y, ductZ], to: [cx, duct.max.y, ductZ], color: '#0284c7' })
          labels.push('Calha V')
        }
      }
      if (inDuct) break
    }
  }

  // 3) Encaixe magnético ortogonal nos vizinhos/referências (X, Y, Z)
  if (opts.magnetic !== false) {
    const refs = [...(opts.anchor ? [opts.anchor] : []), ...(opts.references ?? [])]
    const thresh = 0.055 // 5,5 mm no espaço do painel
    let refX: V3 | null = null, bestDx = thresh
    let refY: V3 | null = null, bestDy = thresh
    for (const r of refs) {
      const dx = Math.abs(x - r[0])
      if (!inDuct && dx < bestDx) { bestDx = dx; refX = r }
      const dy = Math.abs(y - r[1])
      if (!inDuct && dy < bestDy) { bestDy = dy; refY = r }
    }
    if (refX) {
      x = refX[0]
      labels.push('90° Y')
    } else if (opts.gridStep && opts.gridStep > 0) {
      x = Math.round(x / opts.gridStep) * opts.gridStep
    }
    if (refY) {
      y = refY[1]
      labels.push('90° X')
    } else if (opts.gridStep && opts.gridStep > 0) {
      y = Math.round(y / opts.gridStep) * opts.gridStep
    }
    if (refX) guides.push({ axis: 'y', from: refX, to: [x, y, z], color: '#16a34a' })
    if (refY) guides.push({ axis: 'x', from: refY, to: [x, y, z], color: '#ef4444' })
  } else if (opts.gridStep && opts.gridStep > 0) {
    x = Math.round(x / opts.gridStep) * opts.gridStep
    y = Math.round(y / opts.gridStep) * opts.gridStep
  }

  return { point: [x, y, Math.max(frontZ, z)], guides, label: labels.length ? labels.join(' · ') : null, inDuct }
}

/**
 * Gera a curva 3D de pré-visualização ao vivo durante a construção de um cabo:
 * aplica cantos arredondados com raio mínimo real (em ortogonal/manhattan), spline
 * centrípeta suave (em curvo) ou linha direta, sempre à frente da chapa.
 */
export function buildDraftPreviewPoints3D(
  controls: V3[],
  route: Wire['route'],
  outerMm: number,
  orthoInsert = false,
): V3[] {
  if (controls.length < 2) return controls
  const frontZ = wireFrontLimit(outerMm)
  let pts: V3[] = controls.map((p, i) =>
    i === 0 || i === controls.length - 1 ? p : ([p[0], p[1], Math.max(frontZ, p[2])] as V3),
  )
  // Se o modo for ortogonal/manhattan e o utilizador pediu encaixe 90°, insere cotovelo vivo no último segmento
  if (orthoInsert && (route === 'orthogonal' || route === 'manhattan') && pts.length >= 2) {
    const expanded: V3[] = [pts[0]]
    for (let i = 1; i < pts.length; i++) {
      const prev = expanded[expanded.length - 1]
      const curr = pts[i]
      const dx = Math.abs(curr[0] - prev[0]), dy = Math.abs(curr[1] - prev[1])
      if (dx > 0.045 && dy > 0.045) {
        const zMid = Math.max(frontZ, prev[2], curr[2])
        expanded.push(route === 'manhattan' ? [prev[0], curr[1], zMid] : [curr[0], prev[1], zMid])
      }
      expanded.push(curr)
    }
    pts = expanded
  }
  const unique = pts.filter((p, i) => i === 0 || v(p).distanceTo(v(pts[i - 1])) > 1e-4)
  if (unique.length < 2) return unique
  if (route === 'direct') return unique
  if (route === 'arc' && unique.length >= 3) {
    const curve = new THREE.CatmullRomCurve3(unique.map(v), false, 'centripetal', 0.35)
    const count = Math.min(120, Math.max(24, unique.length * 16))
    return curve.getPoints(count).map((p, i, all) =>
      i === 0 || i === all.length - 1 ? arr(p) : ([p.x, p.y, Math.max(frontZ, p.z)] as V3),
    )
  }
  if (unique.length >= 3) {
    return keepInFrontOfPlate(roundCorners(unique, outerMm, 6.5), outerMm)
  }
  return unique
}

