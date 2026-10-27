import * as THREE from 'three'
import type { ComponentDefinition } from '../catalog/types'
import { splitGeometryByTriangle } from './breakerHandle'

/**
 * Cabeça operacional de um botão de emergência (cogumelo + fole), separada do
 * corpo pela geometria do próprio CAD.
 *
 * No aparelho real a cabeça é a única peça que se afunda quando o botão é
 * premido: o aro de fixação fica aparafusado à chapa e o bloco de contactos
 * fica atrás. Mover o nó inteiro (o que se fazia antes) arrastava a carcaça
 * toda para dentro da chapa — a animação acontecia no sítio errado.
 *
 * O aro de fixação é o anel mais largo do aparelho, por isso o corte faz-se
 * imediatamente à frente dele: tudo o que está para lá desse plano é cabeça.
 * Nada de nomes de nós — cada CAD nomeia as peças à sua maneira.
 */
export const ACTUATOR_HEAD_NAME = 'dcsimu_head'

/** Tipos cuja cabeça operacional se separa do corpo (botões de emergência com CAD real). */
export const ACTUATOR_HEAD_TYPES: string[] = ['emergencyButton', 'emergencyButtonKeyP20ACR']

export interface ActuatorHead {
  /** Grupo da cabeça; a origem está no plano de corte (empurrar = −Z). */
  pivot: THREE.Group
  /** Plano de corte no referencial do componente (mm). */
  cutZ: number
  /** Curso recomendado para o movimento de pressão (mm). */
  travelMm: number
}

interface Piece {
  mesh: THREE.Mesh
  relative: THREE.Matrix4
  box: THREE.Box3
}

/** Caixa dos triângulos que a malha desenha mesmo (índices incluídos). */
function drawnBox(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4): THREE.Box3 {
  const box = new THREE.Box3()
  const position = geometry.getAttribute('position')
  if (!position) return box
  const index = geometry.index
  const count = index ? index.count : position.count
  const point = new THREE.Vector3()
  for (let i = 0; i < count; i += 1) {
    point.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(matrix)
    box.expandByPoint(point)
  }
  return box
}

/**
 * Separa a cabeça do corpo. `model` é o modelo já normalizado (frente em +Z) e
 * `frame` o referencial onde a peça é montada; a cabeça passa a ser um nó com o
 * nome `dcsimu_head` para poder ser ligada a um controlo.
 */
export function extractActuatorHead(model: THREE.Object3D, frame: THREE.Object3D): ActuatorHead | null {
  model.updateMatrixWorld(true)
  frame.updateMatrixWorld(true)
  // Já separada (GLB publicado, que guarda o nó): não se corta duas vezes.
  const existing = frame.getObjectByName(ACTUATOR_HEAD_NAME)
  if (existing) {
    const box = new THREE.Box3().setFromObject(existing, true)
    const headDepth = box.isEmpty() ? 4 : box.getSize(new THREE.Vector3()).z
    return { pivot: existing as THREE.Group, cutZ: existing.position.z, travelMm: Math.min(5, Math.max(2, Math.round(headDepth * 0.09 * 10) / 10)) }
  }
  const toFrame = new THREE.Matrix4().copy(frame.matrixWorld).invert()

  const pieces: Piece[] = []
  model.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry || !mesh.visible) return
    const relative = new THREE.Matrix4().multiplyMatrices(toFrame, mesh.matrixWorld)
    const box = drawnBox(mesh.geometry, relative)
    if (!box.isEmpty()) pieces.push({ mesh, relative, box })
  })
  if (pieces.length === 0) return null

  const total = new THREE.Box3()
  for (const piece of pieces) total.union(piece.box)
  const depth = total.max.z - total.min.z
  if (depth <= 0) return null
  const centre = total.getCenter(new THREE.Vector3())

  /* Perfil do aparelho em profundidade: por cada fatia de Z, o maior raio ao eixo.
   * O aro de fixação é o máximo desse perfil; a cabeça começa à frente dele. */
  const bins = 48
  const radius = new Float32Array(bins)
  const point = new THREE.Vector3()
  for (const piece of pieces) {
    const position = piece.mesh.geometry.getAttribute('position')
    if (!position) continue
    const stride = Math.max(1, Math.floor(position.count / 900))
    for (let index = 0; index < position.count; index += stride) {
      point.fromBufferAttribute(position, index).applyMatrix4(piece.relative)
      const bin = Math.min(bins - 1, Math.max(0, Math.floor(((point.z - total.min.z) / depth) * bins)))
      radius[bin] = Math.max(radius[bin], Math.hypot(point.x - centre.x, point.y - centre.y))
    }
  }
  let widest = 0
  for (let bin = 0; bin < bins; bin += 1) widest = Math.max(widest, radius[bin])
  if (widest <= 0) return null

  // Fatias do aro (≥ 92 % do raio máximo), agrupadas; fica o anel mais central.
  const ring: boolean[] = []
  for (let bin = 0; bin < bins; bin += 1) ring.push(radius[bin] >= widest * 0.92)
  let best = -1, bestScore = Infinity
  for (let bin = 0; bin < bins; bin += 1) {
    if (!ring[bin]) continue
    let end = bin
    while (end + 1 < bins && ring[end + 1]) end += 1
    const middle = (bin + end) / 2
    const score = Math.abs(middle - bins / 2)
    if (score < bestScore) { bestScore = score; best = end }
    bin = end
  }
  if (best < 0) return null

  const slice = depth / bins
  const cutZ = total.min.z + (best + 1) * slice + slice * 0.25
  const headDepth = total.max.z - cutZ
  if (headDepth <= slice) return null

  // A cabeça tem de ser uma parte real do aparelho (não a superfície toda).
  let headPoints = 0, bodyPoints = 0
  for (const piece of pieces) {
    const position = piece.mesh.geometry.getAttribute('position')
    if (!position) continue
    const stride = Math.max(1, Math.floor(position.count / 900))
    for (let index = 0; index < position.count; index += stride) {
      point.fromBufferAttribute(position, index).applyMatrix4(piece.relative)
      if (point.z > cutZ) headPoints += 1
      else bodyPoints += 1
    }
  }
  if (headPoints < 40 || headPoints > (headPoints + bodyPoints) * 0.9) return null

  const moving: THREE.Mesh[] = []
  for (const piece of pieces) {
    const { moving: headGeometry, fixed } = splitGeometryByTriangle(piece.mesh.geometry, (centroid) =>
      new THREE.Vector3(centroid.x, centroid.y, centroid.z).applyMatrix4(piece.relative).z > cutZ,
    )
    if (headGeometry) {
      headGeometry.applyMatrix4(piece.relative)
      const mesh = new THREE.Mesh(headGeometry, piece.mesh.material)
      mesh.name = `${piece.mesh.name || 'malha'}__head`
      mesh.castShadow = true
      mesh.receiveShadow = true
      moving.push(mesh)
    }
    if (fixed) {
      piece.mesh.geometry = fixed
      piece.mesh.visible = true
    } else piece.mesh.visible = false
  }
  if (moving.length === 0) return null

  const pivot = new THREE.Group()
  pivot.name = ACTUATOR_HEAD_NAME
  pivot.position.set(0, 0, cutZ)
  for (const mesh of moving) {
    mesh.geometry.translate(0, 0, -cutZ)
    pivot.add(mesh)
  }
  frame.add(pivot)
  frame.updateMatrixWorld(true)

  // Curso do plunger: uma décima do comprimento da cabeça, entre 2 e 5 mm (o P20AKR real afunda ~4 mm).
  const travelMm = Math.min(5, Math.max(2, Math.round(headDepth * 0.09 * 10) / 10))
  return { pivot, cutZ, travelMm }
}

/**
 * Prepara a cabeça de um botão de emergência num modelo já montado (editor ou
 * painel 3D) e devolve a definição com o curso convertido para as unidades do
 * modelo. No editor o modelo está em milímetros (1:1); no painel está
 * multiplicado por `PANEL_UNITS_PER_MM`, por isso o curso do controlo tem de
 * acompanhar a mesma escala — senão o botão «afundava» 100 vezes mais.
 */
export function prepareActuatorHead(
  model: THREE.Object3D,
  definition: ComponentDefinition,
  unitsPerMm = 1,
): { definition: ComponentDefinition; head: ActuatorHead | null } {
  const head = extractActuatorHead(model, model)
  const controls = definition.controls ?? []
  if (!controls.some((control) => control.nodes?.includes(ACTUATOR_HEAD_NAME))) return { definition, head }
  return {
    head,
    definition: {
      ...definition,
      controls: controls.map((control) => (control.nodes?.includes(ACTUATOR_HEAD_NAME)
        ? { ...control, travelMm: Math.round(control.travelMm * unitsPerMm * 100) / 100 }
        : control)),
    },
  }
}
