import * as THREE from 'three'
import type { ComponentModelSpec } from './modelPaths'
import { addTerminalSocketBlocks } from './terminalSocketGeometry'

/**
 * Alguns GLB (p.ex. Phoenix PTI6, PE, WEG) trazem `min/max` dos acessores errados
 * (eixos trocados). O GLTFLoader usa esses valores como caixa/esfera de cada
 * geometria, o que falsifica `Box3.setFromObject` (sem `precise`) e o culling.
 * Recalcula as caixas a partir dos vértices reais, uma só vez por geometria
 * (as geometrias são partilhadas entre clones).
 */
export function fixGeometryBounds(root: THREE.Object3D) {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    const geometry = mesh.geometry
    if (geometry.userData.__boundsFixed) return
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    geometry.userData.__boundsFixed = true
  })
}

/** Clona a cena do cache do GLTF garantindo caixas exatas. */
export function cloneModelScene<T extends THREE.Object3D>(scene: T): T {
  fixGeometryBounds(scene)
  return scene.clone(true) as T
}

/** Referencial físico comum ao modelo, às medições e aos pontos dos cabos.
 * Escala os eixos já orientados: a caixa final coincide com as dimensões usadas
 * por terminalLocal3D, mesmo quando as proporções do CAD diferem da ficha. */
export function fitComponentModel(object: THREE.Object3D, spec: ComponentModelSpec, unitsPerMm = 0.01, anchor: 'center' | 'bottom' = 'center'): THREE.Group {
  fixGeometryBounds(object)
  object.rotation.set(...spec.rotation)
  object.scale.set(1, 1, spec.flipDepth ? -1 : 1)
  object.updateMatrixWorld(true)
  const size = new THREE.Box3().setFromObject(object, true).getSize(new THREE.Vector3())
  if (Math.min(size.x, size.y, size.z) <= 0) throw new Error(`Modelo sem volume: ${spec.path}`)
  const frame = new THREE.Group()
  frame.add(object)
  const physical = spec.physicalSizeMm
  frame.scale.set(physical.width * unitsPerMm / size.x, physical.height * unitsPerMm / size.y, physical.depth * unitsPerMm / size.z)
  frame.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(frame, true)
  const center = box.getCenter(new THREE.Vector3())
  frame.position.set(-center.x, anchor === 'bottom' ? -box.min.y : -center.y, -center.z)
  frame.updateMatrixWorld(true)
  const result = new THREE.Group()
  result.add(frame)
  addTerminalSocketBlocks(result, spec, unitsPerMm)
  return result
}
