import * as THREE from 'three'

/**
 * Manípulo real de um disjuntor, descoberto pela geometria do GLB.
 *
 * Confiar no nome dos nós não funciona: cada CAD nomeia as peças à sua maneira
 * (`MANETTE…`, `Part_8`, `WEG_Handle` duplicado em `Node2`…), e nalguns casos o
 * nó inteiro é o corpo do aparelho — mexê-lo move o disjuntor todo.
 *
 * Aqui fazemos o que o olho faz: o corpo é a peça maior; tudo o que fica à
 * frente do plano frontal desse corpo é manípulo. Esses triângulos — e só
 * esses — passam para um grupo com charneira dentro da caixa, que bascula.
 * Não é acrescentada geometria nenhuma ao equipamento.
 */

export interface SplitGeometry {
  moving: THREE.BufferGeometry | null
  fixed: THREE.BufferGeometry | null
}

/** Parte uma malha em duas pelo critério aplicado ao centro de cada triângulo. */
export function splitGeometryByTriangle(
  geometry: THREE.BufferGeometry,
  isMoving: (centroid: THREE.Vector3) => boolean,
): SplitGeometry {
  const source = geometry.index ? geometry.toNonIndexed() : geometry
  const position = source.getAttribute('position')
  const normal = source.getAttribute('normal')
  if (!position) return { moving: null, fixed: null }

  const moving = { p: [] as number[], n: [] as number[] }
  const fixed = { p: [] as number[], n: [] as number[] }
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const centroid = new THREE.Vector3()

  for (let index = 0; index + 2 < position.count; index += 3) {
    a.fromBufferAttribute(position, index)
    b.fromBufferAttribute(position, index + 1)
    c.fromBufferAttribute(position, index + 2)
    centroid.copy(a).add(b).add(c).multiplyScalar(1 / 3)
    const target = isMoving(centroid) ? moving : fixed
    for (let vertex = 0; vertex < 3; vertex += 1) {
      target.p.push(position.getX(index + vertex), position.getY(index + vertex), position.getZ(index + vertex))
      if (normal) target.n.push(normal.getX(index + vertex), normal.getY(index + vertex), normal.getZ(index + vertex))
    }
  }

  const build = (bucket: { p: number[]; n: number[] }) => {
    if (bucket.p.length === 0) return null
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(bucket.p, 3))
    if (bucket.n.length) geo.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.n, 3))
    else geo.computeVertexNormals()
    geo.computeBoundingBox()
    geo.computeBoundingSphere()
    return geo
  }
  return { moving: build(moving), fixed: build(fixed) }
}

export interface BreakerHandle {
  /** Grupo com charneira; basta rodar em X para bascular o manípulo. */
  pivot: THREE.Group
  /** Quanto o manípulo sai da caixa (unidades do modelo normalizado). */
  protrusion: number
}

/**
 * Caixa envolvente dos triângulos que a malha desenha mesmo.
 *
 * `geometry.boundingBox` não serve: há GLB (o MDW é um) em que várias malhas
 * partilham o mesmo buffer de vértices e só diferem no índice — a caixa do
 * buffer inclui vértices que aquela malha nunca desenha.
 */
function drawnBox(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4): THREE.Box3 {
  const box = new THREE.Box3()
  const position = geometry.getAttribute('position')
  if (!position) return box
  const point = new THREE.Vector3()
  const index = geometry.index
  const count = index ? index.count : position.count
  for (let i = 0; i < count; i += 1) {
    point.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(matrix)
    box.expandByPoint(point)
  }
  return box
}

const boxVolume = (box: THREE.Box3): number => {
  const size = box.getSize(new THREE.Vector3())
  return Math.max(0, size.x) * Math.max(0, size.y) * Math.max(0, size.z)
}

/**
 * Extrai o manípulo de um modelo já normalizado (frente = +Z, altura = Y) e
 * devolve-o num grupo com charneira. O modelo fica alterado: as malhas de
 * origem perdem os triângulos que passaram para o manípulo.
 */
export function extractBreakerHandle(model: THREE.Object3D, frame: THREE.Object3D): BreakerHandle | null {
  model.updateMatrixWorld(true)
  frame.updateMatrixWorld(true)
  // Trabalhamos no referencial do componente (onde +Z é mesmo a frente do
  // aparelho). O próprio modelo não serve: estes CAD vêm com a profundidade
  // invertida (`flipDepth`), e aí o «lado de fora» seria a traseira — foi o que
  // fazia mexer a mola de encaixe na calha em vez do manípulo.
  const toModel = new THREE.Matrix4().copy(frame.matrixWorld).invert()

  const meshes: THREE.Mesh[] = []
  model.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (mesh.isMesh && mesh.geometry) meshes.push(mesh)
  })
  if (meshes.length === 0) return null

  // Matriz de cada malha no espaço do modelo e respetiva caixa.
  const parts = meshes.map((mesh) => {
    const relative = new THREE.Matrix4().multiplyMatrices(toModel, mesh.matrixWorld)
    return { mesh, relative, box: drawnBox(mesh.geometry, relative) }
  })

  const total = new THREE.Box3()
  for (const part of parts) total.union(part.box)
  const depth = total.max.z - total.min.z
  if (depth <= 0) return null

  /* Plano frontal da caixa.
   * Não dá para o ir buscar à «peça maior»: há CAD partidos em centenas de
   * malhas minúsculas (o Q2A5 tem 337, o bipolar 493). Usamos a distribuição
   * da própria geometria — a caixa é a esmagadora maioria do material, logo o
   * percentil 97 da profundidade é a frente; o que passa disso é manípulo. */
  const samples: number[] = []
  const probe = new THREE.Vector3()
  for (const part of parts) {
    const position = part.mesh.geometry.getAttribute('position')
    if (!position) continue
    const stride = Math.max(1, Math.floor(position.count / 400))
    for (let index = 0; index < position.count; index += stride) {
      probe.fromBufferAttribute(position, index).applyMatrix4(part.relative)
      samples.push(probe.z)
    }
  }
  if (samples.length < 24) return null
  samples.sort((a, b) => a - b)
  const frontZ = samples[Math.floor(samples.length * 0.97)]
  const protrusion = Math.max(total.max.z - frontZ, depth * 0.01)

  // Só o que está para lá do plano frontal é manípulo.
  const cutZ = frontZ + protrusion * 0.02

  const movingPieces: Array<{ geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[] }> = []
  const handleBox = new THREE.Box3()
  const centroidInModel = new THREE.Vector3()
  const bodyVolume = boxVolume(total)

  for (const part of parts) {
    if (part.box.max.z <= cutZ) continue
    const geometry = part.mesh.geometry
    // Peça pequena e saliente: é o manípulo inteiro — move-se por completo,
    // sem cortes (é o caso do `WEG_Handle`, da `MANETTE` e do `Part_8`).
    if (boxVolume(part.box) < bodyVolume * 0.05) {
      const moved = (geometry.index ? geometry.toNonIndexed() : geometry.clone()).applyMatrix4(part.relative)
      moved.computeBoundingBox()
      if (moved.boundingBox) handleBox.union(moved.boundingBox)
      movingPieces.push({ geometry: moved, material: part.mesh.material })
      part.mesh.visible = false
      // Cópia exata da mesma peça noutro nó (o MDW traz o manípulo duas vezes):
      // ficaria parada por cima da que se mexe.
      for (const other of parts) {
        if (other === part || !other.mesh.visible) continue
        if (other.box.min.distanceTo(part.box.min) < 1e-4 && other.box.max.distanceTo(part.box.max) < 1e-4) other.mesh.visible = false
      }
      continue
    }
    // Peça grande (manípulo moldado no corpo): leva só o que sai da caixa.
    const { moving, fixed } = splitGeometryByTriangle(geometry, (centroid) => {
      centroidInModel.copy(centroid).applyMatrix4(part.relative)
      return centroidInModel.z > cutZ
    })
    if (!moving) continue
    moving.applyMatrix4(part.relative)
    moving.computeBoundingBox()
    if (moving.boundingBox) handleBox.union(moving.boundingBox)
    movingPieces.push({ geometry: moving, material: part.mesh.material })
    if (fixed) part.mesh.geometry = fixed
    else part.mesh.visible = false
  }
  if (movingPieces.length === 0) {
    // Recurso: peça mais saliente e pequena (botões como o do Phoenix EC, que
    // mal passam do plano da caixa).
    const outer = parts
      .filter((part) => boxVolume(part.box) < boxVolume(total) * 0.02 && part.box.max.z >= total.max.z - 1e-4)
      .sort((a, b) => b.box.max.z - a.box.max.z)[0]
    if (!outer) return null
    const moved = (outer.mesh.geometry.index ? outer.mesh.geometry.toNonIndexed() : outer.mesh.geometry.clone()).applyMatrix4(outer.relative)
    moved.computeBoundingBox()
    if (moved.boundingBox) handleBox.union(moved.boundingBox)
    movingPieces.push({ geometry: moved, material: outer.mesh.material })
    outer.mesh.visible = false
  }

  // Charneira: dentro da caixa, atrás do plano frontal — é lá que o manípulo roda.
  const center = handleBox.getCenter(new THREE.Vector3())
  // A charneira fica na base do manípulo, já dentro da caixa.
  const hinge = new THREE.Vector3(center.x, center.y, Math.min(handleBox.min.z, frontZ) - protrusion * 0.2)

  const pivot = new THREE.Group()
  pivot.name = 'dcsimu-breaker-handle'
  pivot.position.copy(hinge)
  for (const piece of movingPieces) {
    piece.geometry.translate(-hinge.x, -hinge.y, -hinge.z)
    const mesh = new THREE.Mesh(piece.geometry, piece.material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    pivot.add(mesh)
  }
  frame.add(pivot)
  frame.updateMatrixWorld(true)
  return { pivot, protrusion }
}
