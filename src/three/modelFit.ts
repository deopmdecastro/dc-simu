import { markCadNodes } from './staticMerge'
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

/** Assinatura visual de um material (dois materiais iguais desenham-se da mesma maneira). */
function materialSignature(material: THREE.Material): string | null {
  if (!(material instanceof THREE.MeshStandardMaterial)) return null
  const m = material as THREE.MeshPhysicalMaterial
  const tex = (t: THREE.Texture | null | undefined) => t?.uuid ?? ''
  return [m.type, m.name, m.color.getHex(), m.emissive.getHex(), m.emissiveIntensity, m.roughness, m.metalness, m.opacity, m.transparent, m.side, m.alphaTest,
    m.depthWrite, m.vertexColors, m.flatShading, m.envMapIntensity, m.wireframe, tex(m.map), tex(m.normalMap), tex(m.roughnessMap), tex(m.metalnessMap),
    tex(m.aoMap), tex(m.emissiveMap), tex(m.alphaMap), tex(m.bumpMap), m.isMeshPhysicalMaterial ? [m.clearcoat, m.clearcoatRoughness, m.transmission, m.ior, m.sheen].join('/') : ''].join('|')
}

/**
 * Cada clone recebe os SEUS materiais (as instâncias podem mudar cores à vontade — lente do sinaleiro,
 * tinta do corpo) e, dentro do clone, materiais visualmente iguais passam a ser um só: os CAD exportam
 * centenas de materiais repetidos (um por face/peça), o que impedia juntar malhas e trocava de estado
 * de render a cada chamada. `finishCadMaterial` reaproveita o acabamento destes materiais próprios.
 */
function shareCloneMaterials(root: THREE.Object3D) {
  const bySignature = new Map<string, THREE.Material>()
  const byReference = new Map<THREE.Material, THREE.Material>()
  const own = (material: THREE.Material) => {
    let out = byReference.get(material)
    if (out) return out
    const signature = materialSignature(material)
    out = signature ? bySignature.get(signature) : undefined
    if (!out) {
      out = material.clone()
      out.userData.__dcCloneOwned = true
      if (signature) bySignature.set(signature, out)
    }
    byReference.set(material, out)
    return out
  }
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh || !mesh.material) return
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material)
  })
}

/** Clona a cena do cache do GLTF garantindo caixas exatas. */
export function cloneModelScene<T extends THREE.Object3D>(scene: T): T {
  fixGeometryBounds(scene)
  const clone = scene.clone(true) as T
  shareCloneMaterials(clone)
  markCadNodes(clone)
  return clone
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
