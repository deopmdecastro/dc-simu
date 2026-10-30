import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Junta, por material, as malhas irmãs de um modelo CAD (mesmo pai, mesmo material): os CAD chegam
 * partidos em centenas de malhas pequenas (o botão de emergência tem 517), e cada malha é uma chamada
 * de desenho — e outra na passagem de sombras. Juntar irmãs mantém tudo o que se anima:
 *
 * - os pivôs (manípulos, cabeças, teclas) são **pais**: as filhas juntam-se entre si e continuam a rodar com eles;
 * - só se «atravessam» nós do GLB marcados por `markCadNodes` e sem anotações (estáticos); malhas criadas pelo código
 *   juntam-se apenas com as irmãs do mesmo pai;
 * - malhas com material próprio (lentes/LEDs clonados para acender sozinhos) ficam sozinhas no grupo e não mudam;
 * - malhas que o código move ou procura uma a uma (com qualquer `userData`, ex.: base da animação) ficam como estão;
 * - transparentes ficam separadas (a ordenação por objeto continua correta).
 *
 * Devolve quantas malhas havia e quantas ficaram. Corre de novo sem efeito (as juntas ficam marcadas).
 */
/** Nós que vieram do GLB (clonados de cache): só estes podem ser «atravessados» ao juntar malhas. */
const CAD_MARK = Symbol.for('dcsimu.cadNode')
type Marked = THREE.Object3D & { [CAD_MARK]?: true }
const isCadNode = (node: THREE.Object3D) => (node as Marked)[CAD_MARK] === true
export function markCadNodes(root: THREE.Object3D) { root.traverse((node) => { (node as Marked)[CAD_MARK] = true }) }

/** Nó do GLB sem papel próprio (sem anotações, sem React): o seu transform nunca muda depois de montado. */
/** Chaves que o carregador/acabamento põe em todos os nós: não são anotações de animação. */
const PASSIVE_KEYS = new Set(['name', 'gltfExtensions', 'gltfExtras', 'cadFinished'])
const annotated = (node: THREE.Object3D) => Object.keys(node.userData).some((key) => !PASSIVE_KEYS.has(key))

function staticCadNode(node: THREE.Object3D): boolean {
  return isCadNode(node) && node.visible && !annotated(node) && !(node as THREE.Object3D & { __r3f?: unknown }).__r3f
}

export function mergeStaticMeshes(root: THREE.Object3D, options: { minGroup?: number } = {}): { before: number; after: number } {
  const minGroup = Math.max(2, options.minGroup ?? 2)
  let before = 0
  root.updateMatrixWorld(true)
  // Destino de cada malha: sobe pelos nós estáticos do GLB até ao primeiro nó que pode mexer-se
  // (pivô criado pelo código, nó anotado pela animação) ou até à raiz.
  const groups = new Map<string, { target: THREE.Object3D; meshes: THREE.Mesh[] }>()
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    before += 1
    if (!mergeable(mesh) || !mesh.parent) return
    let target = mesh.parent
    while (target !== root && target.parent && staticCadNode(target)) target = target.parent
    const material = mesh.material as THREE.Material
    const geometry = mesh.geometry as THREE.BufferGeometry
    const attributes = Object.keys(geometry.attributes).sort().map((name) => `${name}:${geometry.attributes[name].itemSize}`).join(',')
    const key = `${target.uuid}|${material.uuid}|${attributes}|${mesh.renderOrder}|${mesh.layers.mask}`
    const entry = groups.get(key)
    if (entry) entry.meshes.push(mesh)
    else groups.set(key, { target, meshes: [mesh] })
  })
  const inverse = new THREE.Matrix4()
  const relative = new THREE.Matrix4()
  for (const { target, meshes } of groups.values()) {
    if (meshes.length < minGroup) continue
    inverse.copy(target.matrixWorld).invert()
    const geometries: THREE.BufferGeometry[] = []
    for (const mesh of meshes) {
      relative.multiplyMatrices(inverse, mesh.matrixWorld)
      const geometry = (mesh.geometry as THREE.BufferGeometry).clone()
      geometry.applyMatrix4(relative)
      if (!geometry.index) geometry.setIndex([...Array(geometry.attributes.position.count).keys()])
      geometry.morphAttributes = {}
      geometries.push(geometry)
    }
    const merged = mergeGeometries(geometries, false)
    geometries.forEach((geometry) => geometry.dispose())
    if (!merged) continue
    merged.computeBoundingBox()
    merged.computeBoundingSphere()
    const first = meshes[0]
    const combined = new THREE.Mesh(merged, first.material)
    combined.name = `${first.name || 'cad'}·${meshes.length}`
    combined.castShadow = meshes.some((mesh) => mesh.castShadow)
    combined.receiveShadow = meshes.some((mesh) => mesh.receiveShadow)
    combined.renderOrder = first.renderOrder
    combined.layers.mask = first.layers.mask
    combined.frustumCulled = meshes.every((mesh) => mesh.frustumCulled)
    combined.userData = { dcMerged: meshes.length }
    for (const mesh of meshes) mesh.removeFromParent()
    target.add(combined)
    combined.updateMatrixWorld(true)
  }
  let after = 0
  root.traverse((node) => { if ((node as THREE.Mesh).isMesh) after += 1 })
  return { before, after }
}

function mergeable(mesh: THREE.Mesh): boolean {
  if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return false
  if (mesh.children.length || !mesh.visible || mesh.userData.dcMerged) return false
  if (Array.isArray(mesh.material) || !mesh.material) return false
  const material = mesh.material as THREE.Material
  if (material.transparent || !(material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshBasicMaterial || material instanceof THREE.MeshLambertMaterial || material instanceof THREE.MeshPhongMaterial)) return false
  const geometry = mesh.geometry as THREE.BufferGeometry | undefined
  if (!geometry?.isBufferGeometry || !geometry.attributes.position || (geometry as THREE.InstancedBufferGeometry).isInstancedBufferGeometry) return false
  if (geometry.groups.length > 1 || Object.keys(geometry.morphAttributes).length) return false
  // Qualquer anotação na malha (base de animação, sobreposições, bandeiras de lente…) = o código conta com ela.
  if (annotated(mesh)) return false
  // Malhas declaradas em JSX pertencem ao React (r3f): não se tiram da cena por fora.
  if ((mesh as THREE.Mesh & { __r3f?: unknown }).__r3f) return false
  return true
}
