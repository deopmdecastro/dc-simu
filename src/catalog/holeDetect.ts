import * as THREE from 'three'
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh'
import type { Vec3 } from './types'
import { FACE_NORMAL, type Face } from './terminalProfiles'

/** Furo encontrado na superfície do modelo (mm, no espaço do componente). */
export interface DetectedHole {
  id: string
  face: Face
  /** Centro do furo, à superfície da peça (onde assenta o borne). */
  position: Vec3
  normal: Vec3
  diameterMm: number
  depthMm: number
  /** Furo passante (o raio atravessa o modelo). */
  through: boolean
}

export interface HoleScanOptions {
  /** Resolução da varredura por face (nº de raios por lado). */
  grid?: number
  minDiameterMm?: number
  maxDiameterMm?: number
  minDepthMm?: number
  /** Nº máximo de furos devolvidos (os maiores primeiro). */
  limit?: number
  /** Diagnóstico: recebe cada mancha analisada e o motivo de rejeição. */
  onCandidate?: (info: { diameterMm: number; depthMm: number; aspect: number; fill: number; cells: number; reason: string }) => void
}

// Raycast acelerado por BVH: sem isto, varrer um modelo CAD com centenas de
// malhas demoraria mais de um minuto por face.
const geometryProto = THREE.BufferGeometry.prototype as unknown as Record<string, unknown>
geometryProto.computeBoundsTree = computeBoundsTree
geometryProto.disposeBoundsTree = disposeBoundsTree
THREE.Mesh.prototype.raycast = acceleratedRaycast as typeof THREE.Mesh.prototype.raycast

const AXES: Record<Face, 0 | 1 | 2> = { right: 0, left: 0, top: 1, bottom: 1, front: 2, back: 2 }

/**
 * Procura furos (encaixes de bornes, fichas banana, parafusos) numa face do
 * modelo: lança uma grelha de raios contra a peça e marca as células que estão
 * recuadas em relação à superfície à volta. Cada mancha redonda de células
 * recuadas é um furo, com centro, diâmetro e profundidade.
 */
export function detectHoles(root: THREE.Object3D, face: Face, options: HoleScanOptions = {}): DetectedHole[] {
  const grid = Math.max(24, Math.min(192, options.grid ?? 96))
  const minDiameter = options.minDiameterMm ?? 1.5
  const maxDiameter = options.maxDiameterMm ?? 32
  const minDepth = options.minDepthMm ?? 0.7
  const limit = options.limit ?? 40

  root.updateMatrixWorld(true)
  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    const geometry = mesh.geometry as unknown as { boundsTree?: unknown; computeBoundsTree?: () => void }
    if (mesh.isMesh && geometry && !geometry.boundsTree) geometry.computeBoundsTree?.()
  })
  const box = new THREE.Box3().setFromObject(root, true)
  if (box.isEmpty()) return []
  const axis = AXES[face]
  const normal = FACE_NORMAL[face]
  const sign = normal[axis] > 0 ? 1 : -1
  const uAxis = axis === 0 ? 1 : 0
  const vAxis = axis === 2 ? 1 : 2
  const min = box.min.toArray() as Vec3
  const max = box.max.toArray() as Vec3
  const span = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2])
  const uMin = min[uAxis]
  const vMin = min[vAxis]
  const uStep = (max[uAxis] - uMin) / grid
  const vStep = (max[vAxis] - vMin) / grid
  if (uStep <= 0 || vStep <= 0) return []
  const start = sign > 0 ? max[axis] + span * 0.05 : min[axis] - span * 0.05
  const far = span * 1.3

  // Profundidade de cada célula, medida a partir do plano de partida.
  const direction = new THREE.Vector3()
  direction.setComponent(axis, -sign)
  const raycaster = new THREE.Raycaster()
  raycaster.far = far
  ;(raycaster as THREE.Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true
  const origin = new THREE.Vector3()
  const depth = new Float32Array(grid * grid).fill(Infinity)
  for (let j = 0; j < grid; j += 1) {
    for (let i = 0; i < grid; i += 1) {
      origin.setComponent(axis, start)
      origin.setComponent(uAxis, uMin + (i + 0.5) * uStep)
      origin.setComponent(vAxis, vMin + (j + 0.5) * vStep)
      raycaster.set(origin, direction)
      const hit = raycaster.intersectObject(root, true)[0]
      if (hit) depth[j * grid + i] = hit.distance
    }
  }

  // Superfície local = célula menos funda numa janela à volta (tolera peças
  // curvas e degraus); uma célula é «recuada» quando cai bastante abaixo dela.
  const window = Math.max(2, Math.round(grid * 0.05))
  const baseline = new Float32Array(grid * grid).fill(Infinity)
  for (let j = 0; j < grid; j += 1) {
    for (let i = 0; i < grid; i += 1) {
      let best = Infinity
      for (let dj = -window; dj <= window; dj += 1) {
        const y = j + dj
        if (y < 0 || y >= grid) continue
        for (let di = -window; di <= window; di += 1) {
          const x = i + di
          if (x < 0 || x >= grid) continue
          const value = depth[y * grid + x]
          if (value < best) best = value
        }
      }
      baseline[j * grid + i] = best
    }
  }

  // Silhueta: primeira e última célula com peça em cada linha/coluna. Uma
  // célula sem toque só é furo passante se estiver dentro da silhueta.
  const rowFirst = new Int32Array(grid).fill(-1)
  const rowLast = new Int32Array(grid).fill(-1)
  const colFirst = new Int32Array(grid).fill(-1)
  const colLast = new Int32Array(grid).fill(-1)
  for (let j = 0; j < grid; j += 1) {
    for (let i = 0; i < grid; i += 1) {
      if (!Number.isFinite(depth[j * grid + i])) continue
      if (rowFirst[j] < 0) rowFirst[j] = i
      rowLast[j] = i
      if (colFirst[i] < 0) colFirst[i] = j
      colLast[i] = j
    }
  }

  const recessed = new Uint8Array(grid * grid)
  for (let k = 0; k < depth.length; k += 1) {
    const base = baseline[k]
    if (!Number.isFinite(base)) continue // fora da peça
    const value = depth[k]
    const i = k % grid
    const j = (k - i) / grid
    if (!Number.isFinite(value)) {
      const inside = rowFirst[j] >= 0 && colFirst[i] >= 0 && i > rowFirst[j] && i < rowLast[j] && j > colFirst[i] && j < colLast[i]
      if (inside) recessed[k] = 2 // furo passante
      continue
    }
    if (value - base >= minDepth) recessed[k] = 1
  }

  // Manchas ligadas de células recuadas = candidatos a furo.
  const seen = new Uint8Array(grid * grid)
  const holes: DetectedHole[] = []
  const queue: number[] = []
  for (let k = 0; k < recessed.length; k += 1) {
    if (!recessed[k] || seen[k]) continue
    queue.length = 0
    queue.push(k)
    seen[k] = 1
    const cells: number[] = []
    let touchesBorder = false
    let through = false
    while (queue.length) {
      const cell = queue.pop()!
      cells.push(cell)
      const i = cell % grid
      const j = (cell - i) / grid
      if (i === 0 || j === 0 || i === grid - 1 || j === grid - 1) touchesBorder = true
      if (recessed[cell] === 2) through = true
      const neighbours = [i > 0 ? cell - 1 : -1, i < grid - 1 ? cell + 1 : -1, j > 0 ? cell - grid : -1, j < grid - 1 ? cell + grid : -1]
      for (const next of neighbours) if (next >= 0 && recessed[next] && !seen[next]) { seen[next] = 1; queue.push(next) }
    }
    if (touchesBorder || cells.length < 4) { options.onCandidate?.({ diameterMm: 0, depthMm: 0, aspect: 0, fill: 0, cells: cells.length, reason: touchesBorder ? 'borda' : 'pequeno' }); continue }

    let uSum = 0
    let vSum = 0
    let iMin = grid
    let iMax = 0
    let jMin = grid
    let jMax = 0
    let depthSum = 0
    let depthCount = 0
    let baseSum = 0
    for (const cell of cells) {
      const i = cell % grid
      const j = (cell - i) / grid
      uSum += i
      vSum += j
      iMin = Math.min(iMin, i); iMax = Math.max(iMax, i)
      jMin = Math.min(jMin, j); jMax = Math.max(jMax, j)
      baseSum += baseline[cell]
      if (Number.isFinite(depth[cell])) { depthSum += depth[cell] - baseline[cell]; depthCount += 1 }
    }
    const area = cells.length * uStep * vStep
    const width = (iMax - iMin + 1) * uStep
    const height = (jMax - jMin + 1) * vStep
    const diameter = 2 * Math.sqrt(area / Math.PI)
    const aspect = width > height ? width / height : height / width
    const fill = area / (width * height)
    // Só manchas aproximadamente redondas (um rasgo comprido não é um furo).
    if (aspect > 2.1 || fill < 0.55) { options.onCandidate?.({ diameterMm: diameter, depthMm: 0, aspect, fill, cells: cells.length, reason: 'forma' }); continue }
    if (diameter < minDiameter || diameter > maxDiameter) { options.onCandidate?.({ diameterMm: diameter, depthMm: 0, aspect, fill, cells: cells.length, reason: 'diâmetro' }); continue }
    options.onCandidate?.({ diameterMm: diameter, depthMm: depthCount ? depthSum / depthCount : 0, aspect, fill, cells: cells.length, reason: 'ok' })

    const u = uMin + (uSum / cells.length + 0.5) * uStep
    const v = vMin + (vSum / cells.length + 0.5) * vStep
    const surface = start - sign * (baseSum / cells.length) * 1
    const position: Vec3 = [0, 0, 0]
    position[axis] = Math.round(surface * 100) / 100
    position[uAxis] = Math.round(u * 100) / 100
    position[vAxis] = Math.round(v * 100) / 100
    holes.push({
      id: `hole-${face}-${holes.length + 1}`,
      face,
      position,
      normal: [...normal] as Vec3,
      diameterMm: Math.round(diameter * 10) / 10,
      depthMm: through ? Math.round(span * 10) / 10 : Math.round((depthCount ? depthSum / depthCount : minDepth) * 10) / 10,
      through,
    })
  }

  return holes.sort((a, b) => b.diameterMm - a.diameterMm).slice(0, limit)
}

/** Furo mais próximo de um ponto da superfície (para encaixar o borne ao clicar). */
export function nearestHole(holes: DetectedHole[], point: Vec3, toleranceMm = 0): DetectedHole | null {
  let best: DetectedHole | null = null
  let bestDistance = Infinity
  for (const hole of holes) {
    const dx = hole.position[0] - point[0]
    const dy = hole.position[1] - point[1]
    const dz = hole.position[2] - point[2]
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
    const limit = toleranceMm || Math.max(3, hole.diameterMm)
    if (distance < bestDistance && distance <= limit) { bestDistance = distance; best = hole }
  }
  return best
}
