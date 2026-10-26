import * as THREE from 'three'
import { computeBoundsTree } from 'three-mesh-bvh'
import type { DetectedHole } from './holeDetect'
// O módulo dos furos ativa o raycast acelerado (BVH) nas malhas.
import './holeDetect'
import type { Face } from './terminalProfiles'
import type { TerminalDef, Vec3 } from './types'

/**
 * Verifica se cada borne está mesmo dentro da cavidade do furo do equipamento.
 *
 * Mede o modelo renderizado com raios paralelos à normal do borne (o mesmo método do teste
 * `test:terminal-geometry` dos modelos integrados): um raio no centro dá o fundo da cavidade e
 * um anel de 12 raios à volta dá a boca (superfície exterior). O ponto de ligação tem de ficar
 * entre a boca e o fundo — nem a flutuar à frente, nem enterrado no material.
 */

export type SeatStatus = 'seated' | 'mouth' | 'outside' | 'buried' | 'surface' | 'floating'

export interface SeatReport {
  id: string
  label: string
  status: SeatStatus
  face: Face
  /** Distâncias ao longo da normal, medidas a partir do lado de fora do modelo (mm). */
  lipMm: number
  floorMm: number
  targetMm: number
  /** Profundidade da cavidade (fundo − boca). 0 = superfície plana. */
  cavityMm: number
  message: string
}

export const SEAT_LABEL: Record<SeatStatus, string> = {
  seated: 'Dentro da cavidade',
  mouth: 'À boca do furo',
  outside: 'Fora do modelo',
  buried: 'Dentro do material',
  surface: 'Sem furo (face plana)',
  floating: 'Sem superfície',
}

const AXIS_OF: Record<Face, 0 | 1 | 2> = { front: 2, back: 2, left: 0, right: 0, top: 1, bottom: 1 }
const SIGN_OF: Record<Face, 1 | -1> = { front: 1, back: -1, left: -1, right: 1, top: 1, bottom: -1 }

/** Face do componente para onde a normal aponta (eixo dominante). */
export function faceOfNormal(normal: Vec3): Face {
  const [x, y, z] = normal.map(Math.abs)
  if (x >= y && x >= z) return normal[0] >= 0 ? 'right' : 'left'
  if (y >= z) return normal[1] >= 0 ? 'top' : 'bottom'
  return normal[2] >= 0 ? 'front' : 'back'
}

const prepared = new WeakSet<THREE.Object3D>()
function prepare(root: THREE.Object3D) {
  if (prepared.has(root)) return
  root.updateWorldMatrix(true, true)
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    const geometry = mesh.geometry as THREE.BufferGeometry & { boundsTree?: unknown }
    if (!geometry.boundsTree) computeBoundsTree.call(geometry)
  })
  prepared.add(root)
}

/** Mede a cavidade debaixo de um ponto (mm, espaço do componente). */
export function measureSeat(root: THREE.Object3D, position: Vec3, normal: Vec3, diameterMm = 4, box?: THREE.Box3): Omit<SeatReport, 'id' | 'label' | 'message'> {
  prepare(root)
  const bounds = box ?? new THREE.Box3().setFromObject(root, true)
  const face = faceOfNormal(normal)
  const axis = AXIS_OF[face], sign = SIGN_OF[face]
  const u = (axis + 1) % 3, v = (axis + 2) % 3
  const start = sign > 0 ? bounds.max.getComponent(axis) + 1 : bounds.min.getComponent(axis) - 1
  const ray = new THREE.Raycaster() as THREE.Raycaster & { firstHitOnly?: boolean }
  ray.firstHitOnly = true
  const direction = new THREE.Vector3().setComponent(axis, -sign)
  const sample = (a: number, b: number) => {
    const origin = new THREE.Vector3(...position).setComponent(axis, start)
    origin.setComponent(u, origin.getComponent(u) + a).setComponent(v, origin.getComponent(v) + b)
    ray.set(origin, direction)
    return ray.intersectObject(root, true)[0]?.distance ?? Infinity
  }
  const floor = sample(0, 0)
  const radius = Math.max(0.6, diameterMm * 0.65)
  const ring: number[] = []
  for (let i = 0; i < 12; i++) ring.push(sample(Math.cos(i * Math.PI / 6) * radius, Math.sin(i * Math.PI / 6) * radius))
  const finite = ring.filter(Number.isFinite).sort((a, b) => a - b)
  const lip = finite.length ? finite[Math.floor(finite.length * 0.25)] : Infinity
  const target = (start - position[axis]) * sign
  const cavity = Number.isFinite(floor) && Number.isFinite(lip) ? Math.max(0, floor - lip) : 0
  let status: SeatStatus
  if (!Number.isFinite(lip) && !Number.isFinite(floor)) status = 'floating'
  else if (finite.length < 6 || cavity <= 0.7) status = target > (Number.isFinite(floor) ? floor : lip) + 0.1 ? 'buried' : 'surface'
  else if (target < lip - 0.3) status = 'outside'
  else if (target <= lip + 0.1) status = 'mouth'
  else if (target >= floor - 0.1) status = 'buried'
  else status = 'seated'
  const r = (n: number) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : n)
  return { status, face, lipMm: r(lip), floorMm: r(floor), targetMm: r(target), cavityMm: r(cavity) }
}

const MESSAGE: Record<SeatStatus, (report: Omit<SeatReport, 'id' | 'label' | 'message'>) => string> = {
  seated: (m) => `Centro ${(m.targetMm - m.lipMm).toFixed(1)} mm para dentro, cavidade de ${m.cavityMm.toFixed(1)} mm.`,
  mouth: (m) => `Está à superfície de um furo com ${m.cavityMm.toFixed(1)} mm de fundo: deve recuar para dentro da cavidade.`,
  outside: (m) => `Está ${(m.lipMm - m.targetMm).toFixed(1)} mm à frente da superfície, a flutuar fora do equipamento.`,
  buried: () => 'O ponto de ligação está dentro do material (atrás do fundo do furo).',
  surface: () => 'Não há furo debaixo do borne: face plana ou parafuso exterior. Procure o furo mais próximo.',
  floating: () => 'Nenhuma superfície do modelo atrás do borne nesta face.',
}

/** Relatório de encaixe de todos os bornes de uma definição. */
export function auditTerminalSeats(root: THREE.Object3D, terminals: TerminalDef[]): SeatReport[] {
  const box = new THREE.Box3().setFromObject(root, true)
  if (box.isEmpty()) return []
  return terminals.map((terminal) => {
    const measured = measureSeat(root, terminal.position, terminal.normal, terminal.diameterMm ?? 4, box)
    return { id: terminal.id, label: terminal.label, ...measured, message: MESSAGE[measured.status](measured) }
  })
}

/** Recuo do ponto de ligação dentro de uma cavidade com `depthMm` de fundo (igual aos modelos integrados). */
export function socketInsetFor(depthMm: number): number {
  const depth = Math.max(0.2, depthMm)
  return Math.round(Math.min(3, Math.max(Math.min(1, depth * 0.4), depth / 3)) * 100) / 100
}

/** Geometria de um borne encaixado num furo detetado: centro recuado + profundidade/recuo do encaixe. */
export function holeSocket(hole: Pick<DetectedHole, 'position' | 'normal' | 'depthMm' | 'diameterMm' | 'through'>): Pick<TerminalDef, 'position' | 'normal' | 'diameterMm' | 'socketDepthMm' | 'socketInsetMm'> {
  const depth = Math.round((hole.through ? Math.min(hole.depthMm, 12) : hole.depthMm) * 100) / 100
  const inset = socketInsetFor(depth)
  const round = (n: number) => Math.round(n * 100) / 100
  return {
    position: hole.position.map((value, index) => round(value - hole.normal[index] * inset)) as Vec3,
    normal: hole.normal,
    diameterMm: Math.round(hole.diameterMm * 10) / 10,
    socketDepthMm: depth,
    socketInsetMm: inset,
  }
}

/**
 * Proposta de correção de um borne mal encaixado: o furo livre mais próximo na mesma face
 * (distância medida no plano da face, até `toleranceMm`). Se o borne já está centrado numa
 * cavidade (`mouth`), basta recuá-lo para dentro dela.
 */
export function nearestHoleOnFace(terminal: Pick<TerminalDef, 'position' | 'diameterMm'>, face: Face, holes: DetectedHole[], toleranceMm?: number): DetectedHole | null {
  const axis = AXIS_OF[face]
  const tolerance = toleranceMm ?? Math.max(5, (terminal.diameterMm ?? 4) * 1.5)
  let best: DetectedHole | null = null
  let bestDistance = Infinity
  for (const hole of holes) {
    if (hole.face !== face) continue
    let d2 = 0
    for (let i = 0; i < 3; i++) if (i !== axis) d2 += (hole.position[i] - terminal.position[i]) ** 2
    const distance = Math.sqrt(d2)
    if (distance <= tolerance && distance < bestDistance) { best = hole; bestDistance = distance }
  }
  return best
}

export function seatFix(terminal: TerminalDef, report: SeatReport, holes: DetectedHole[], toleranceMm?: number): Pick<TerminalDef, 'position' | 'normal' | 'diameterMm' | 'socketDepthMm' | 'socketInsetMm'> | null {
  if (report.status === 'seated') return null
  const axis = AXIS_OF[report.face]
  const best = nearestHoleOnFace(terminal, report.face, holes, toleranceMm)
  if (best) return holeSocket(best)
  if (report.status === 'mouth' || report.status === 'outside') {
    const sign = SIGN_OF[report.face]
    const inset = socketInsetFor(report.cavityMm)
    const position = [...terminal.position] as Vec3
    // posição medida a partir de fora: boca + recuo
    const start = terminal.position[axis] + sign * report.targetMm
    position[axis] = Math.round((start - sign * (report.lipMm + inset)) * 100) / 100
    const normal: Vec3 = [0, 0, 0]; normal[axis] = sign
    return { position, normal, diameterMm: terminal.diameterMm ?? 4, socketDepthMm: report.cavityMm, socketInsetMm: inset }
  }
  return null
}

/**
 * Como `holeSocket`, mas confirma no próprio modelo: se a cavidade real for mais rasa do que o
 * furo detetado (ex.: cabeça de parafuso no centro de um borne de aperto), o ponto de ligação
 * fica a meio do espaço livre medido; se não houver espaço nenhum, fica à boca, sem recuo.
 */
export function socketForHole(root: THREE.Object3D, hole: DetectedHole): Pick<TerminalDef, 'position' | 'normal' | 'diameterMm' | 'socketDepthMm' | 'socketInsetMm'> {
  const socket = holeSocket(hole)
  if (measureSeat(root, socket.position, socket.normal, socket.diameterMm).status === 'seated') return socket
  const atMouth = measureSeat(root, hole.position, hole.normal, socket.diameterMm)
  const axis = AXIS_OF[atMouth.face], sign = SIGN_OF[atMouth.face]
  const start = hole.position[axis] + sign * atMouth.targetMm
  const round = (n: number) => Math.round(n * 100) / 100
  const position = [...hole.position] as Vec3
  if (Number.isFinite(atMouth.lipMm) && atMouth.cavityMm > 0.2) {
    const inset = round(atMouth.cavityMm / 2)
    position[axis] = round(start - sign * (atMouth.lipMm + inset))
    return { position, normal: hole.normal, diameterMm: socket.diameterMm, socketDepthMm: round(atMouth.cavityMm), socketInsetMm: inset }
  }
  if (Number.isFinite(atMouth.lipMm)) position[axis] = round(start - sign * atMouth.lipMm)
  return { position, normal: hole.normal, diameterMm: socket.diameterMm }
}
